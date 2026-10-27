import assert from "node:assert/strict";
import test from "node:test";
import { exampleTape } from "../src/examples/tape.js";
import { buildSnapshot } from "../src/state/snapshot.js";
import { TOKEN_BUDGET } from "../src/state/tokens.js";
import { tapeInput } from "./fixtures.js";

test("snapshot uses only data from before the decision and stays under the token budget", () => {
  const tape = exampleTape();
  const built = buildSnapshot(tapeInput(tape));
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(built.tokens < TOKEN_BUDGET);
  assert.ok(built.snapshot.mid > 0);
  assert.ok(built.snapshot.ret.short > 0);
  assert.equal(built.snapshot.inventory, 0);
  assert.equal(built.snapshot.as_of_ms < tape.decisionTs, true);

  const poisoned = buildSnapshot({
    ...tapeInput(tape),
    trades: [
      ...tape.trades,
      { ts: tape.decisionTs, price: 1, size: 1 },
      { ts: tape.decisionTs + 5_000, price: 1, size: 1 },
    ],
    books: [
      ...tape.books,
      { ts: tape.decisionTs, bid: 1, bidSize: 100, ask: 1.01, askSize: 1 },
      { ts: tape.decisionTs + 5_000, bid: 1, bidSize: 1, ask: 1.01, askSize: 100 },
    ],
    inventory: [...tape.inventory, { ts: tape.decisionTs, qty: 50 }],
    equity: [...tape.equity, { ts: tape.decisionTs + 1, equity: 1 }],
  });
  assert.deepEqual(poisoned, built);
});

test("a point exactly at the cutoff is excluded", () => {
  const tape = exampleTape();
  const without = buildSnapshot(tapeInput(tape));
  const onlyFutureBook = buildSnapshot({
    ...tapeInput(tape),
    books: tape.books.filter((book) => book.ts < tape.decisionTs - 1_000),
  });
  assert.equal(without.ok, true);
  assert.equal(onlyFutureBook.ok, true);
  if (!without.ok || !onlyFutureBook.ok) return;
  assert.notEqual(without.snapshot.mid, onlyFutureBook.snapshot.mid);
});
