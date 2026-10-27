import { randomUUID } from "node:crypto";
import type { Broker } from "../broker/types.js";
import { Book } from "../book/book.js";
import { CHECKS } from "../book/bench.js";
import type { DeskLog } from "../logs/jsonl.js";
import type { BotReads, DecisionScores, RawAnswers } from "../policy/decide.js";
import { decide } from "../policy/decide.js";
import type { RiskConfig } from "../risk/vetoes.js";
import { PINNED_MODEL } from "../pinned.js";
import { buildSnapshot, type Snapshot, type SnapshotInput, type Windows } from "../state/snapshot.js";
import { BOTS, isRiskCheck, type BotName, type CheckId, type Mode } from "../types.js";
import { questionsFor } from "../questions/index.js";
import { withDeadline } from "../desk/deadline.js";
import type { JudgeReply } from "../judge/reply.js";
import { equityCheck, hardFacts, staleBook, tooClose } from "./stages.js";

export interface AskJudge {
  (req: {
    bot: BotName;
    state: Snapshot;
    decisionId: string;
    deadlineMs: number;
    signal: AbortSignal;
  }): Promise<JudgeReply>;
}

export interface FunnelDeps {
  log: DeskLog;
  book: Book;
  broker: Broker;
  ask: AskJudge;
  nowMs: number;
  decisionTs: number;
  deadlineMs: number;
  minLeadMs: number;
  staleMs: number;
  windows: Windows;
  blockMs: number;
  orderQty: number;
  risk: RiskConfig;
  mode: Mode;
  decisionId?: string;
}

export interface Prepared {
  symbol: string;
  snapshot: Snapshot;
  tokens: number;
  scores: DecisionScores;
  model: string;
}

export interface FunnelResult {
  decisionId: string;
  prepared: Prepared | null;
  holdReason: string;
}

interface Built {
  input: SnapshotInput;
  snapshot: Snapshot;
  tokens: number;
}

export async function runFunnel(deps: FunnelDeps, inputs: readonly SnapshotInput[]): Promise<FunnelResult> {
  const decisionId = deps.decisionId ?? randomUUID();
  const open = deps.book.openPosition();
  if (open) {
    reject(deps, decisionId, null, "position_already_open", "scan skipped while a position is open");
    const mine = inputs.filter((input) => input.symbol === open.symbol);
    const picked = await narrow(deps, decisionId, mine, true);
    return { decisionId, prepared: picked, holdReason: picked ? "selected" : "no_candidate" };
  }
  const picked = await narrow(deps, decisionId, inputs, false);
  return { decisionId, prepared: picked, holdReason: picked ? "selected" : "no_candidate" };
}

async function narrow(
  deps: FunnelDeps,
  decisionId: string,
  inputs: readonly SnapshotInput[],
  managing: boolean,
): Promise<Prepared | null> {
  const built: Built[] = [];
  for (const input of inputs) {
    if (!managing && deps.book.isBenched(input.symbol, deps.nowMs)) {
      reject(deps, decisionId, input.symbol, "benched");
      continue;
    }
    const result = buildSnapshot({ ...input, decisionTs: deps.decisionTs, windows: deps.windows });
    if (!result.ok) {
      reject(deps, decisionId, input.symbol, result.reason);
      deps.book.bench(input.symbol, result.reason, deps.nowMs, deps.blockMs);
      continue;
    }
    deps.log.write({
      kind: "snapshot",
      ts: deps.nowMs,
      decisionId,
      symbol: input.symbol,
      decisionTs: deps.decisionTs,
      tokens: result.tokens,
      snapshot: result.snapshot,
    });
    const stale = staleBook(result.snapshot, deps.decisionTs, deps.staleMs);
    if (stale) {
      reject(deps, decisionId, input.symbol, stale);
      deps.book.bench(input.symbol, stale, deps.nowMs, deps.blockMs);
      continue;
    }
    built.push({ input, snapshot: result.snapshot, tokens: result.tokens });
  }
  if (built.length === 0) return null;

  const closeToBlock = tooClose(deps.deadlineMs, deps.nowMs, deps.minLeadMs);
  if (closeToBlock) {
    for (const item of built) {
      reject(deps, decisionId, item.snapshot.symbol, closeToBlock);
      deps.book.bench(item.snapshot.symbol, closeToBlock, deps.nowMs, deps.blockMs);
    }
    return null;
  }

  const account = await deps.broker.getAccount({
    symbol: built[0]!.snapshot.symbol,
    mid: built[0]!.snapshot.mid,
  });
  const broke = equityCheck(account);
  if (broke) {
    for (const item of built) {
      reject(deps, decisionId, item.snapshot.symbol, broke);
      deps.book.bench(item.snapshot.symbol, broke, deps.nowMs, deps.blockMs);
    }
    return null;
  }

  const position = await deps.broker.getPosition();
  const positionQty = position?.qty ?? 0;
  const survivors: Built[] = [];
  for (const item of built) {
    const side = managing ? (positionQty > 0 ? "sell" : "buy") : "buy";
    const qty = managing ? Math.abs(positionQty) : deps.orderQty;
    const check = hardFacts({
      snapshot: item.snapshot,
      side,
      qty,
      positionQty: managing ? positionQty : 0,
      account,
      risk: deps.risk,
    });
    if (check) {
      reject(deps, decisionId, item.snapshot.symbol, check);
      deps.book.bench(item.snapshot.symbol, check, deps.nowMs, deps.blockMs);
      continue;
    }
    survivors.push(item);
  }
  if (survivors.length === 0) return null;

  const judged = (
    await Promise.all(survivors.map((item) => judgeCandidate(deps, decisionId, item, positionQty)))
  ).filter((item): item is Prepared => item !== null);
  return finalPick(deps, decisionId, judged);
}

async function judgeCandidate(
  deps: FunnelDeps,
  decisionId: string,
  item: Built,
  positionQty: number,
): Promise<Prepared | null> {
  const reads = {} as Record<BotName, RawAnswers>;
  const models: string[] = [];
  for (const bot of BOTS) {
    for (const question of questionsFor(bot)) {
      deps.log.write({
        kind: "question",
        ts: deps.nowMs,
        decisionId,
        bot,
        questionId: question.id,
        questionType: question.type,
        instructions: question.instructions,
        criteria: question.type === "noul" ? { true: question.true, false: question.false } : question.criteria,
      });
    }
  }
  const replies = await Promise.all(
    BOTS.map(async (bot) => {
      const raced = await withDeadline(deps.deadlineMs, (signal) =>
        deps.ask({
          bot,
          state: item.snapshot,
          decisionId,
          deadlineMs: deps.deadlineMs,
          signal,
        }),
      );
      return { bot, raced };
    }),
  );
  let failure: CheckId | null = null;
  let failureDetail = "";
  for (const { bot, raced } of replies) {
    if (raced === "deadline" || !raced.ok) {
      if (!failure) {
        failure = raced === "deadline" ? "block_deadline" : statusCheck(raced.status);
        failureDetail = raced === "deadline" ? "deadline" : raced.status;
      }
      continue;
    }
    let missing = false;
    for (const question of questionsFor(bot)) {
      const answer = raced.answers[question.id];
      if (!answer) {
        missing = true;
        break;
      }
      deps.log.write({
        kind: "answer",
        ts: deps.nowMs,
        decisionId,
        bot,
        questionId: question.id,
        model: raced.model,
        answer,
      });
    }
    if (missing) {
      if (!failure) {
        failure = "jev_unavailable";
        failureDetail = `incomplete ${bot}`;
      }
      continue;
    }
    reads[bot] = raced.answers;
    models.push(raced.model);
  }
  if (failure) {
    reject(deps, decisionId, item.snapshot.symbol, failure, failureDetail);
    deps.book.bench(item.snapshot.symbol, failure, deps.nowMs, deps.blockMs);
    return null;
  }
  const model = models.every((value) => value === models[0]) ? (models[0] ?? null) : null;
  if (model !== PINNED_MODEL) {
    reject(deps, decisionId, item.snapshot.symbol, "model_version", models.join(","));
    deps.book.bench(item.snapshot.symbol, "model_version", deps.nowMs, deps.blockMs);
    return null;
  }
  const scores = decide({
    snapshot: item.snapshot,
    bots: reads as BotReads,
    position: positionQty === 0 ? null : { symbol: item.snapshot.symbol, qty: positionQty },
  });
  return { symbol: item.snapshot.symbol, snapshot: item.snapshot, tokens: item.tokens, scores, model };
}

function finalPick(deps: FunnelDeps, decisionId: string, judged: Prepared[]): Prepared | null {
  const tradable = judged.filter((item) => item.scores.action !== "hold");
  if (tradable.length === 0) {
    for (const item of judged) {
      const check = item.scores.reason === "ambiguous" ? "ambiguous" : "below_threshold";
      reject(deps, decisionId, item.symbol, check);
      deps.book.bench(item.symbol, check, deps.nowMs, deps.blockMs);
    }
    return null;
  }
  const ranked = [...tradable].sort((a, b) => b.scores.margin - a.scores.margin);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;
  if (second && Math.abs(best.scores.margin - second.scores.margin) <= 1e-9) {
    for (const item of ranked) {
      reject(deps, decisionId, item.symbol, "ambiguous");
      deps.book.bench(item.symbol, "ambiguous", deps.nowMs, deps.blockMs);
    }
    return null;
  }
  for (const item of judged) {
    if (item === best) continue;
    reject(deps, decisionId, item.symbol, "not_selected");
    deps.book.bench(item.symbol, "not_selected", deps.nowMs, deps.blockMs);
  }
  return best;
}

function statusCheck(status: string): CheckId {
  if (status === "malformed_question" || status === "rate_limited" || status === "block_deadline") return status;
  return "jev_unavailable";
}

function reject(deps: FunnelDeps, decisionId: string, symbol: string | null, check: CheckId, detail?: string): void {
  const stage = CHECKS[check].stage;
  deps.log.write({
    kind: "rejection",
    ts: deps.nowMs,
    decisionId,
    symbol,
    stage,
    check,
    ...(detail ? { detail } : {}),
  });
  if (symbol && isRiskCheck(check)) {
    deps.log.write({
      kind: "veto",
      ts: deps.nowMs,
      decisionId,
      symbol,
      check,
      ...(detail ? { detail } : {}),
    });
  }
}
