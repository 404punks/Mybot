import assert from "node:assert/strict";
import test from "node:test";
import { createBroker } from "../src/broker/paper.js";
import { PINNED_MODEL } from "../src/pinned.js";
import {
  clearOrder,
  consumeClearance,
  firstVeto,
  preModelVeto,
  type RiskFacts,
} from "../src/risk/vetoes.js";
import { riskFor } from "./fixtures.js";

function facts(over: Partial<RiskFacts> = {}): RiskFacts {
  return {
    symbol: "ETH-USD",
    side: "buy",
    qty: 1,
    mid: 100,
    spreadBps: 2,
    equity: 100_000,
    positionQty: 0,
    dailyPnl: 0,
    model: PINNED_MODEL,
    config: riskFor("ETH-USD"),
    ...over,
  };
}

test("each hard veto fires on its own fact and a forged pass does not clear it", () => {
  assert.equal(firstVeto(facts({ model: "jev-1.13.0" })), "model_version");
  assert.equal(firstVeto(facts({ model: "jev-1.14.0-extra" })), "model_version");
  assert.equal(firstVeto(facts({ mid: 5_000_000 })), "range_guard");
  assert.equal(firstVeto(facts({ config: { ...riskFor("ETH-USD"), ranges: {} } })), "range_guard");
  assert.equal(firstVeto(facts({ qty: 5, config: { ...riskFor("ETH-USD"), maxPositionQty: 1 } })), "max_position");
  assert.equal(
    firstVeto(facts({ qty: 10, equity: 100, config: { ...riskFor("ETH-USD"), maxPositionQty: 100, leverageCap: 1 } })),
    "leverage_cap",
  );
  assert.equal(firstVeto(facts({ dailyPnl: -150, config: { ...riskFor("ETH-USD"), dailyLossLimit: 100 } })), "daily_loss");
  assert.equal(firstVeto(facts({ spreadBps: 100 })), "fees_plus_gas");
  assert.equal(firstVeto({ ...facts(), override: true } as RiskFacts), null);
});

test("a reducing close is still allowed after the daily loss limit", () => {
  const closing = facts({
    side: "sell",
    qty: 1,
    positionQty: 1,
    dailyPnl: -500,
  });
  assert.equal(preModelVeto(closing), null);
});

test("clearance is minted only by the risk module and dies after one use", async () => {
  const order = { decisionId: "d1", symbol: "ETH-USD", side: "buy" as const, qty: 1, model: PINNED_MODEL };
  const broker = createBroker("paper", { cash: 100_000, feeBps: 0, gasQuote: 0 });
  await assert.rejects(() => broker.placeOrder({ ...order, bid: 99, ask: 101 }, order));
  const clearance = clearOrder(facts(), order);
  await broker.placeOrder({ ...order, bid: 99, ask: 101 }, clearance);
  assert.throws(() => consumeClearance(clearance, order), /not issued/);
});
