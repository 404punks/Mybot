import { readFileSync } from "node:fs";
import { createBroker } from "./broker/paper.js";
import { Book } from "./book/book.js";
import { deskConfig } from "./desk/config.js";
import { createClock } from "./desk/clock.js";
import { runDecision } from "./desk/loop.js";
import { exampleTape, type ExampleTape } from "./examples/tape.js";
import { JudgeHttpClient } from "./judge/client.js";
import { JsonlLog } from "./logs/jsonl.js";
import { DEFAULT_RISK } from "./risk/vetoes.js";
import type { SnapshotInput } from "./state/snapshot.js";

const config = deskConfig(process.env);
const arg = process.argv[2];
const tape = arg ? (JSON.parse(readFileSync(arg, "utf8")) as ExampleTape) : exampleTape();
const blockMs = 12_000;
const clock = createClock(blockMs, tape.decisionTs - blockMs);
const log = new JsonlLog(process.env.DESK_LOG ?? "logs/desk.jsonl", [config.deskSecret]);
const broker = createBroker("paper", { cash: 100_000, feeBps: DEFAULT_RISK.feeBps, gasQuote: DEFAULT_RISK.gasQuote });
const judge = new JudgeHttpClient({ url: config.judgeUrl, deskSecret: config.deskSecret });
const risk = {
  ...DEFAULT_RISK,
  ranges: { [tape.symbol]: { min: 1, max: 1_000_000 } },
};
const input: SnapshotInput = {
  symbol: tape.symbol,
  decisionTs: tape.decisionTs,
  trades: tape.trades,
  books: tape.books,
  inventory: tape.inventory,
  equity: tape.equity,
  windows: tape.windows,
};

const decisionId = await runDecision(
  {
    log,
    book: new Book(),
    broker,
    ask: (req) => judge.ask(req),
    nowMs: tape.decisionTs,
    decisionTs: tape.decisionTs,
    deadlineMs: clock.nextBlockAt(tape.decisionTs),
    minLeadMs: 250,
    staleMs: blockMs * 2,
    windows: tape.windows,
    blockMs,
    orderQty: 1,
    risk,
    mode: config.mode,
  },
  [input],
);
process.stdout.write(`${config.mode} ${decisionId}\n`);
