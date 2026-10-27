import assert from "node:assert/strict";
import test from "node:test";
import { runDecision } from "../src/desk/loop.js";
import { exampleTape } from "../src/examples/tape.js";
import { PINNED_MODEL } from "../src/pinned.js";
import { askFrom, closeReads, longReads, paperDesk, tapeInput } from "./fixtures.js";

test("shadow logs the policy action and does not place an order", async () => {
  const tape = exampleTape();
  const { deps, log, broker } = paperDesk({ mode: "shadow" });
  let placed = 0;
  const place = broker.placeOrder.bind(broker);
  broker.placeOrder = async (order, clearance) => {
    placed += 1;
    return place(order, clearance);
  };
  await runDecision(deps, [tapeInput(tape)]);
  assert.equal(placed, 0);
  const decision = log.events.find((event) => event.kind === "decision");
  assert.ok(decision && decision.kind === "decision");
  assert.equal(decision.policyAction, "open_long");
  assert.equal(decision.executed, false);
  assert.equal(decision.reason, "shadow");
  assert.equal(decision.model, PINNED_MODEL);
  assert.ok(log.events.some((event) => event.kind === "snapshot"));
  assert.ok(log.events.some((event) => event.kind === "question"));
  assert.ok(log.events.filter((event) => event.kind === "answer").every((event) => event.model === PINNED_MODEL));
});

test("paper mode fills one order and will not scan a second name", async () => {
  const tape = exampleTape();
  const { deps, log, broker, book } = paperDesk({ mode: "paper" });
  await runDecision(deps, [tapeInput(tape)]);
  assert.equal((await broker.getPosition())?.qty, 1);
  assert.equal(book.hasOpen(), true);
  const fill = log.events.find((event) => event.kind === "fill");
  assert.ok(fill && fill.kind === "fill");
  assert.ok(fill.realizedPnl < 0);

  let asked = 0;
  deps.ask = async (req) => {
    asked += 1;
    return askFrom(closeReads())(req);
  };
  deps.nowMs = Date.now();
  deps.deadlineMs = deps.nowMs + 5_000;
  const other = { ...tapeInput(tape), symbol: "BTC-USD" };
  await runDecision(deps, [other, tapeInput(tape)]);
  const skipped = log.events.filter((event) => event.kind === "rejection" && event.check === "position_already_open");
  assert.ok(skipped.length >= 1);
  assert.equal(asked, 3);
  assert.equal(log.events.some((event) => event.kind === "rejection" && event.symbol === "BTC-USD"), false);
  assert.equal(await broker.getPosition(), null);
});

test("a decision that misses the block is a hold and does not fill", async () => {
  const tape = exampleTape();
  const { deps, log, broker } = paperDesk();
  const start = Date.now();
  deps.nowMs = start;
  deps.deadlineMs = start + 30;
  deps.minLeadMs = 5;
  deps.ask = () => new Promise((resolve) => setTimeout(() => resolve(askFrom(longReads())({
    bot: "gambler",
    state: {} as never,
    decisionId: "x",
    deadlineMs: 0,
    signal: new AbortController().signal,
  })), 250));
  await runDecision(deps, [tapeInput(tape)]);
  assert.equal(await broker.getPosition(), null);
  assert.ok(log.events.some((event) => event.kind === "rejection" && event.check === "block_deadline"));
  const decision = log.events.find((event) => event.kind === "decision");
  assert.ok(decision && decision.kind === "decision");
  assert.equal(decision.executed, false);
});

test("a free cut rejects before any judge call", async () => {
  const tape = exampleTape();
  const { deps, log } = paperDesk();
  let asked = 0;
  deps.ask = async (req) => {
    asked += 1;
    return askFrom(longReads())(req);
  };
  deps.book.bench(tape.symbol, "fees_plus_gas", deps.nowMs, deps.blockMs);
  await runDecision(deps, [tapeInput(tape)]);
  assert.equal(asked, 0);
  const rejection = log.events.find((event) => event.kind === "rejection");
  assert.ok(rejection && rejection.kind === "rejection");
  assert.equal(rejection.check, "benched");
  assert.equal(rejection.stage, "free_cut");
});

test("a wrong model string is kept and vetoed", async () => {
  const tape = exampleTape();
  const { deps, log, broker } = paperDesk({ ask: askFrom(longReads(), "jev-1.13.0") });
  await runDecision(deps, [tapeInput(tape)]);
  assert.equal(await broker.getPosition(), null);
  const answers = log.events.filter((event) => event.kind === "answer");
  assert.ok(answers.length > 0);
  assert.ok(answers.every((event) => event.kind === "answer" && event.model === "jev-1.13.0"));
  assert.ok(log.events.some((event) => event.kind === "veto" && event.check === "model_version"));
});
