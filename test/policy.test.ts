import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "../src/policy/decide.js";
import { ACTION_COSTS_BPS, THRESHOLDS, thresholdForCost } from "../src/policy/thresholds.js";
import { longReads, closeReads, readySnapshot } from "./fixtures.js";

test("each action has one threshold, and a costlier mistake demands a higher one", () => {
  const costs = [0, 4, 8, 25, 100];
  const thresholds = costs.map(thresholdForCost);
  for (let i = 1; i < thresholds.length; i += 1) {
    const prev = thresholds[i - 1] ?? 0;
    const next = thresholds[i] ?? 0;
    assert.ok(next > prev);
  }
  assert.ok(THRESHOLDS.open_long > THRESHOLDS.close);
  assert.ok(THRESHOLDS.close > THRESHOLDS.hold);
  assert.equal(THRESHOLDS.open_long, thresholdForCost(ACTION_COSTS_BPS.open_long));
  assert.equal(THRESHOLDS.open_short, thresholdForCost(ACTION_COSTS_BPS.open_short));
  assert.equal(THRESHOLDS.close, thresholdForCost(ACTION_COSTS_BPS.close));
});

test("a clean continuation clears the long threshold and a crowded tape does not", () => {
  const snapshot = readySnapshot();
  const clean = decide({ snapshot, bots: longReads(), position: null });
  assert.equal(clean.action, "open_long");
  assert.ok(clean.scores.open_long >= THRESHOLDS.open_long);
  assert.equal(clean.scores.open_short, 0);

  const crowded = longReads();
  crowded.gambler = { ...crowded.gambler, crowded: { type: "noul", noul: 0.9 } };
  const held = decide({ snapshot, bots: crowded, position: null });
  assert.equal(held.action, "hold");
  assert.ok(held.scores.open_long < THRESHOLDS.open_long);
});

test("an open position is not a new entry, and a broken tape can close it", () => {
  const snapshot = readySnapshot();
  const managing = decide({
    snapshot,
    bots: closeReads(),
    position: { symbol: snapshot.symbol, qty: 1 },
  });
  assert.equal(managing.scores.open_long, 0);
  assert.equal(managing.scores.open_short, 0);
  assert.equal(managing.action, "close");
});
