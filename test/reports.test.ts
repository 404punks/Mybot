import assert from "node:assert/strict";
import test from "node:test";
import type { LogEvent, OutcomeEvent } from "../src/logs/events.js";
import { calibrate } from "../src/reports/calibration.js";
import { reliabilitySvg } from "../src/reports/chart.js";
import { dailySummary, dayKey } from "../src/reports/daily.js";
import { labelOutcomes } from "../src/reports/labels.js";
import { readySnapshot } from "./fixtures.js";

test("calibration buckets predicted probability against the outcome and scores Brier", () => {
  const outcomes: OutcomeEvent[] = [
    { kind: "outcome", ts: 1, decisionId: "a", questionId: "crowded", probability: 1, outcome: 1, labeledAt: 1 },
    { kind: "outcome", ts: 1, decisionId: "b", questionId: "crowded", probability: 1, outcome: 0, labeledAt: 1 },
    { kind: "outcome", ts: 1, decisionId: "c", questionId: "crowded", probability: 0, outcome: 0, labeledAt: 1 },
  ];
  const report = calibrate(outcomes);
  assert.equal(report.brier, 1 / 3);
  const top = report.buckets.find((bucket) => bucket.lo === 0.9);
  assert.equal(top?.count, 2);
  assert.equal(top?.actualRate, 0.5);
  const bottom = report.buckets.find((bucket) => bucket.lo === 0);
  assert.equal(bottom?.count, 1);
  assert.equal(bottom?.actualRate, 0);
  const svg = reliabilitySvg(report.buckets);
  assert.match(svg, /<svg/);
  assert.match(svg, /<circle/);
});

test("the daily summary counts decisions, fills, pnl after fees, and vetoes", () => {
  const ts = Date.parse("2026-10-27T08:00:00Z");
  const events: LogEvent[] = [
    {
      kind: "decision",
      ts,
      decisionId: "d1",
      mode: "paper",
      symbol: "ETH-USD",
      policyAction: "open_long",
      executed: true,
      reason: "filled",
      scores: { open_long: 0.9, open_short: 0, close: 0, hold: 0.1 },
      thresholds: { open_long: 0.8, open_short: 0.8, close: 0.7, hold: 0.6 },
      model: "jev-1.14.0",
    },
    {
      kind: "fill",
      ts,
      decisionId: "d1",
      symbol: "ETH-USD",
      side: "buy",
      qty: 1,
      price: 100,
      fee: 1.5,
      gas: 0.5,
      realizedPnl: -2,
    },
    { kind: "veto", ts, decisionId: "d2", symbol: "ETH-USD", check: "daily_loss" },
    { kind: "veto", ts: ts + 60_000, decisionId: "d3", symbol: "ETH-USD", check: "daily_loss" },
  ];
  const summary = dailySummary(events, dayKey(ts, "Asia/Dhaka"));
  assert.equal(summary.day, "2026-10-27");
  assert.equal(summary.decisions, 1);
  assert.equal(summary.trades, 1);
  assert.equal(summary.pnlAfterFees, -2);
  assert.equal(summary.fees, 1.5);
  assert.equal(summary.gas, 0.5);
  assert.equal(summary.vetoes[0]?.check, "daily_loss");
  assert.equal(summary.vetoes[0]?.count, 2);
});

test("outcome labels use prices after the decision only", () => {
  const snapshot = readySnapshot();
  const decisionTs = 1_000;
  const events: LogEvent[] = [
    {
      kind: "snapshot",
      ts: 1,
      decisionId: "d",
      symbol: snapshot.symbol,
      decisionTs,
      tokens: 10,
      snapshot: { ...snapshot, ret: { ...snapshot.ret, short: 0.01 } },
    },
    {
      kind: "answer",
      ts: 1,
      decisionId: "d",
      bot: "gambler",
      questionId: "tape_shape",
      model: "jev-1.14.0",
      answer: {
        type: "choice",
        choice: "continuation",
        confidence: 0.7,
        probabilities: { continuation: 0.7, snap_back: 0.2, stall: 0.05, other: 0.05 },
      },
    },
  ];
  const books = [
    { ts: 500, bid: 1, bidSize: 1, ask: 1.1, askSize: 1 },
    { ts: 1_000, bid: 99.9, bidSize: 1, ask: 100.1, askSize: 1 },
    { ts: 1_500, bid: 109.9, bidSize: 1, ask: 110.1, askSize: 1 },
    { ts: 2_500, bid: 1, bidSize: 1, ask: 1.1, askSize: 1 },
  ];
  const up = labelOutcomes(events, [{ symbol: snapshot.symbol, books }], 1_000, 9);
  const continuation = up.find((row) => row.probability === 0.7);
  assert.equal(continuation?.outcome, 1);

  const down = labelOutcomes(
    events,
    [{
      symbol: snapshot.symbol,
      books: books.map((book) => (book.ts === 1_500 ? { ...book, bid: 89.9, ask: 90.1 } : book)),
    }],
    1_000,
    9,
  );
  assert.equal(down.find((row) => row.probability === 0.7)?.outcome, 0);
  assert.equal(down.find((row) => row.probability === 0.2)?.outcome, 1);

  const poisoned = labelOutcomes(
    events,
    [{
      symbol: snapshot.symbol,
      books: [
        { ts: 999, bid: 1, bidSize: 1, ask: 1.01, askSize: 1 },
        ...books.filter((book) => book.ts >= 1_000),
      ],
    }],
    1_000,
    9,
  );
  assert.deepEqual(
    poisoned.map((row) => row.outcome),
    up.map((row) => row.outcome),
  );
});
