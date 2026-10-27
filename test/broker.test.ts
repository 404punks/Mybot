import assert from "node:assert/strict";
import test from "node:test";
import { createBroker } from "../src/broker/paper.js";
import { PINNED_MODEL } from "../src/pinned.js";
import { clearOrder, type RiskFacts } from "../src/risk/vetoes.js";
import { riskFor } from "./fixtures.js";

test("the factory refuses anything except the paper broker", () => {
  assert.throws(() => createBroker("live", { cash: 1, feeBps: 0, gasQuote: 0 }), /no live orders/);
});

test("a round trip pnl is the fees and gas, and a second name is refused", async () => {
  const broker = createBroker("paper", { cash: 10_000, feeBps: 100, gasQuote: 1 });
  const base: RiskFacts = {
    symbol: "ETH-USD",
    side: "buy",
    qty: 1,
    mid: 100,
    spreadBps: 1,
    equity: 10_000,
    positionQty: 0,
    dailyPnl: 0,
    model: PINNED_MODEL,
    config: { ...riskFor("ETH-USD"), feeBps: 100, gasQuote: 1, referenceEdgeBps: 10_000 },
  };
  const buy = clearOrder(base, {
    decisionId: "open",
    symbol: "ETH-USD",
    side: "buy",
    qty: 1,
    model: PINNED_MODEL,
  });
  const opened = await broker.placeOrder(
    { decisionId: "open", symbol: "ETH-USD", side: "buy", qty: 1, bid: 99, ask: 100 },
    buy,
  );
  assert.equal(opened.price, 100);
  assert.equal(opened.realizedPnl, -2);
  const marked = await broker.getAccount({ symbol: "ETH-USD", mid: 100 });
  assert.equal(marked.equity, 9_998);

  const sell = clearOrder(
    { ...base, side: "sell", positionQty: 1, equity: marked.equity, dailyPnl: marked.dailyPnl },
    { decisionId: "close", symbol: "ETH-USD", side: "sell", qty: 1, model: PINNED_MODEL },
  );
  const closed = await broker.placeOrder(
    { decisionId: "close", symbol: "ETH-USD", side: "sell", qty: 1, bid: 100, ask: 101 },
    sell,
  );
  assert.equal(closed.realizedPnl, -2);
  assert.equal((await broker.getPosition()), null);
  const flat = await broker.getAccount({ symbol: "ETH-USD", mid: 100 });
  assert.equal(flat.cash, 9_996);
  assert.equal(flat.dailyPnl, -4);

  const again = clearOrder(
    { ...base, equity: flat.equity, dailyPnl: flat.dailyPnl },
    { decisionId: "other", symbol: "ETH-USD", side: "buy", qty: 1, model: PINNED_MODEL },
  );
  await broker.placeOrder(
    { decisionId: "other", symbol: "ETH-USD", side: "buy", qty: 1, bid: 99, ask: 100 },
    again,
  );
  const btcConfig = { ...base.config, ranges: { "BTC-USD": { min: 1, max: 1_000_000 } } };
  const btc = clearOrder(
    { ...base, symbol: "BTC-USD", config: btcConfig, equity: 9_000, positionQty: 0 },
    { decisionId: "nope", symbol: "BTC-USD", side: "buy", qty: 1, model: PINNED_MODEL },
  );
  await assert.rejects(
    () =>
      broker.placeOrder(
        { decisionId: "nope", symbol: "BTC-USD", side: "buy", qty: 1, bid: 99, ask: 100 },
        btc,
      ),
    /one open position/,
  );
});
