import type { AnswerEvent, LogEvent, OutcomeEvent, SnapshotEvent } from "../logs/events.js";
import type { TopBook } from "../state/snapshot.js";

const STALL = 1e-4;

export interface TapeBooks {
  symbol: string;
  books: readonly TopBook[];
}

/**
 * Proxy labels from prices strictly after the decision.
 * A now-cast with no forward rule is left unlabeled.
 */
export function labelOutcomes(
  events: readonly LogEvent[],
  tapes: readonly TapeBooks[],
  horizonMs: number,
  nowMs: number,
): OutcomeEvent[] {
  const snapshots = new Map<string, SnapshotEvent>();
  for (const event of events) {
    if (event.kind === "snapshot") snapshots.set(`${event.decisionId}:${event.symbol}`, event);
  }
  const outcomes: OutcomeEvent[] = [];
  for (const event of events) {
    if (event.kind !== "answer") continue;
    const snapshot = [...snapshots.values()].find((item) => item.decisionId === event.decisionId);
    if (!snapshot) continue;
    const tape = tapes.find((item) => item.symbol === snapshot.symbol);
    if (!tape) continue;
    const forward = forwardReturn(tape.books, snapshot.decisionTs, horizonMs);
    if (forward === null) continue;
    outcomes.push(...rowsFor(event, snapshot.snapshot.ret.short, snapshot.snapshot.spread_bps, forward, tape, snapshot.decisionTs, horizonMs, nowMs));
  }
  return outcomes;
}

function rowsFor(
  event: AnswerEvent,
  pastShort: number,
  spreadBps: number,
  forward: { logReturn: number; meanSpreadBps: number },
  _tape: TapeBooks,
  _decisionTs: number,
  _horizonMs: number,
  nowMs: number,
): OutcomeEvent[] {
  if (event.questionId === "tape_shape" && event.answer.type === "choice") {
    const realized = classify(forward.logReturn, pastShort);
    return Object.entries(event.answer.probabilities).map(([option, probability]) => ({
      kind: "outcome" as const,
      ts: nowMs,
      decisionId: event.decisionId,
      questionId: event.questionId,
      probability,
      outcome: option === realized ? 1 : 0,
      labeledAt: nowMs,
    }));
  }
  if (event.questionId === "crowded" && event.answer.type === "noul") {
    const realized = classify(forward.logReturn, pastShort);
    return [
      {
        kind: "outcome",
        ts: nowMs,
        decisionId: event.decisionId,
        questionId: event.questionId,
        probability: event.answer.noul,
        outcome: realized === "snap_back" ? 1 : 0,
        labeledAt: nowMs,
      },
    ];
  }
  if (event.questionId === "push_through_spread" && event.answer.type === "noul") {
    const continued = Math.sign(forward.logReturn) === Math.sign(pastShort) && Math.abs(forward.logReturn) > STALL;
    const tight = forward.meanSpreadBps <= spreadBps;
    return [
      {
        kind: "outcome",
        ts: nowMs,
        decisionId: event.decisionId,
        questionId: event.questionId,
        probability: event.answer.noul,
        outcome: continued && tight ? 1 : 0,
        labeledAt: nowMs,
      },
    ];
  }
  return [];
}

function classify(forward: number, pastShort: number): "continuation" | "snap_back" | "stall" | "other" {
  if (Math.abs(forward) <= STALL) return "stall";
  if (pastShort === 0) return "other";
  if (Math.sign(forward) === Math.sign(pastShort)) return "continuation";
  return "snap_back";
}

function forwardReturn(
  books: readonly TopBook[],
  decisionTs: number,
  horizonMs: number,
): { logReturn: number; meanSpreadBps: number } | null {
  const window = books.filter((book) => book.ts >= decisionTs && book.ts < decisionTs + horizonMs);
  if (window.length < 2) return null;
  const start = window[0];
  const end = window[window.length - 1];
  if (!start || !end) return null;
  const midStart = (start.bid + start.ask) / 2;
  const midEnd = (end.bid + end.ask) / 2;
  if (!(midStart > 0) || !(midEnd > 0)) return null;
  const spreads = window.map((book) => ((book.ask - book.bid) / ((book.ask + book.bid) / 2)) * 10_000);
  const meanSpreadBps = spreads.reduce((sum, value) => sum + value, 0) / spreads.length;
  return { logReturn: Math.log(midEnd / midStart), meanSpreadBps };
}
