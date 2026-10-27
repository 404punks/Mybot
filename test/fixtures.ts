import { createBroker, type PaperBroker } from "../src/broker/paper.js";
import { Book } from "../src/book/book.js";
import type { FunnelDeps } from "../src/filter/funnel.js";
import type { JudgeReply } from "../src/judge/reply.js";
import { MemoryLog } from "../src/logs/jsonl.js";
import type { BotReads, RawAnswers } from "../src/policy/decide.js";
import { DEFAULT_RISK, type RiskConfig } from "../src/risk/vetoes.js";
import { exampleTape, type ExampleTape } from "../src/examples/tape.js";
import { buildSnapshot, type Snapshot, type SnapshotInput } from "../src/state/snapshot.js";
import type { BotName } from "../src/types.js";
import { PINNED_MODEL } from "../src/pinned.js";
import { questionsFor } from "../src/questions/index.js";

export function tapeInput(tape: ExampleTape = exampleTape()): SnapshotInput {
  return {
    symbol: tape.symbol,
    decisionTs: tape.decisionTs,
    trades: tape.trades,
    books: tape.books,
    inventory: tape.inventory,
    equity: tape.equity,
    windows: tape.windows,
  };
}

export function readySnapshot(tape: ExampleTape = exampleTape()): Snapshot {
  const built = buildSnapshot(tapeInput(tape));
  if (!built.ok) throw new Error(built.reason);
  return built.snapshot;
}

export function choice(
  selected: string,
  probabilities: Record<string, number>,
): RawAnswers[string] {
  return { type: "choice", choice: selected, confidence: probabilities[selected] ?? 0, probabilities };
}

export function noul(value: number): RawAnswers[string] {
  return { type: "noul", noul: value };
}

export function score(value: number): RawAnswers[string] {
  return { type: "score", score: value, confidence: 0.5, probabilities: { "0": 0.1, "1": 0.2, "2": 0.3, "3": 0.4 } };
}

export function longReads(): BotReads {
  return {
    gambler: {
      tape_shape: choice("continuation", { continuation: 0.96, snap_back: 0.02, stall: 0.01, other: 0.01 }),
      tape_shape_named: noul(0.95),
      crowded: noul(0.05),
      one_sided: noul(0.95),
    },
    house: {
      stretch: choice("inside_range", { stretched_up: 0.04, stretched_down: 0.03, inside_range: 0.9, other: 0.03 }),
      stretch_named: noul(0.92),
      two_sided: noul(0.2),
      spread_pays: noul(0.05),
      inventory_pressure: score(0.2),
    },
    spy: {
      disagreement: choice("book_agrees", {
        book_fights_tape: 0.02,
        book_agrees: 0.94,
        both_quiet: 0.02,
        other: 0.02,
      }),
      disagreement_named: noul(0.93),
      vol_regime: choice("ordinary", { quiet: 0.05, ordinary: 0.85, jumpy: 0.05, other: 0.05 }),
      vol_regime_named: noul(0.9),
      push_through_spread: noul(0.92),
      quiet_before: noul(0.4),
    },
  };
}

export function closeReads(): BotReads {
  return {
    gambler: {
      tape_shape: choice("snap_back", { continuation: 0.02, snap_back: 0.95, stall: 0.02, other: 0.01 }),
      tape_shape_named: noul(0.93),
      crowded: noul(0.85),
      one_sided: noul(0.4),
    },
    house: {
      stretch: choice("stretched_down", { stretched_up: 0.04, stretched_down: 0.9, inside_range: 0.04, other: 0.02 }),
      stretch_named: noul(0.91),
      two_sided: noul(0.2),
      spread_pays: noul(0.2),
      inventory_pressure: score(2.4),
    },
    spy: {
      disagreement: choice("book_fights_tape", {
        book_fights_tape: 0.92,
        book_agrees: 0.04,
        both_quiet: 0.02,
        other: 0.02,
      }),
      disagreement_named: noul(0.9),
      vol_regime: choice("jumpy", { quiet: 0.05, ordinary: 0.1, jumpy: 0.8, other: 0.05 }),
      vol_regime_named: noul(0.88),
      push_through_spread: noul(0.2),
      quiet_before: noul(0.3),
    },
  };
}

export function replyFrom(reads: BotReads, bot: BotName, model = PINNED_MODEL): JudgeReply {
  return {
    ok: true,
    model,
    answers: reads[bot],
    usage: { input_tokens: 180, output_tokens: 40 },
  };
}

export function askFrom(reads: BotReads, model = PINNED_MODEL): FunnelDeps["ask"] {
  return async (req) => replyFrom(reads, req.bot, model);
}

export function skeletonAnswers(bot: BotName): RawAnswers {
  const answers: RawAnswers = {};
  for (const question of questionsFor(bot)) {
    if (question.type === "noul") answers[question.id] = { type: "noul", noul: 0.2 };
    else if (question.type === "score") {
      answers[question.id] = { type: "score", score: 1, confidence: 0.4, probabilities: { "0": 0.25, "1": 0.5, "2": 0.2, "3": 0.05 } };
    } else {
      const probabilities: Record<string, number> = {};
      for (const label of Object.keys(question.criteria)) probabilities[label] = label === "other" ? 0.1 : 0.3;
      const selected = Object.keys(question.criteria).find((label) => label !== "other") ?? "other";
      answers[question.id] = { type: "choice", choice: selected, confidence: 0.3, probabilities };
    }
  }
  return answers;
}

export function riskFor(symbol: string): RiskConfig {
  return { ...DEFAULT_RISK, ranges: { [symbol]: { min: 1, max: 1_000_000 } } };
}

export function paperDesk(over: Partial<FunnelDeps> = {}): { deps: FunnelDeps; log: MemoryLog; broker: PaperBroker; book: Book } {
  const tape = exampleTape();
  const log = new MemoryLog();
  const broker = createBroker("paper", { cash: 100_000, feeBps: 4, gasQuote: 0 });
  const book = new Book();
  const now = Date.now();
  const deps: FunnelDeps = {
    log,
    book,
    broker,
    ask: askFrom(longReads()),
    nowMs: now,
    decisionTs: tape.decisionTs,
    deadlineMs: now + 5_000,
    minLeadMs: 250,
    staleMs: 30_000,
    windows: tape.windows,
    blockMs: 1_000,
    orderQty: 1,
    risk: riskFor(tape.symbol),
    mode: "paper",
    ...over,
  };
  return { deps, log, broker, book };
}
