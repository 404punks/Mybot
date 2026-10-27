import type { TimedEquity, TimedQty, TopBook, Trade, Windows } from "../state/snapshot.js";

export interface ExampleTape {
  symbol: string;
  decisionTs: number;
  windows: Windows;
  trades: Trade[];
  books: TopBook[];
  inventory: TimedQty[];
  equity: TimedEquity[];
}

/** A short rising tape with every window anchored before the decision. */
export function exampleTape(): ExampleTape {
  const origin = 1_700_000_000_000;
  const decisionTs = origin + 50_000;
  const windows: Windows = { shortMs: 5_000, mediumMs: 15_000, longMs: 40_000 };
  const trades: Trade[] = [];
  const books: TopBook[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const ts = origin + i * 1_000;
    const price = 100 + i * 0.05;
    trades.push({ ts, price, size: 1 });
    books.push({ ts, bid: price - 0.01, bidSize: 8, ask: price + 0.01, askSize: 3 });
  }
  return {
    symbol: "ETH-USD",
    decisionTs,
    windows,
    trades,
    books,
    inventory: [{ ts: origin, qty: 0 }],
    equity: [
      { ts: origin, equity: 100_000 },
      { ts: decisionTs - 1, equity: 100_000 },
    ],
  };
}
