import assert from "node:assert/strict";
import test from "node:test";
import { Book } from "../src/book/book.js";
import { benchDurationMs } from "../src/book/bench.js";

test("the reason sets how long a name stays benched", () => {
  const book = new Book();
  assert.equal(benchDurationMs("malformed_question", 1_000), 1_000_000);
  assert.equal(benchDurationMs("benched", 1_000), 0);
  book.bench("ETH-USD", "fees_plus_gas", 0, 1_000);
  assert.equal(book.isBenched("ETH-USD", 2_999), true);
  assert.equal(book.isBenched("ETH-USD", 3_000), false);
  book.bench("ETH-USD", "daily_loss", 0, 1_000);
  book.bench("ETH-USD", "stale_book", 100, 1_000);
  assert.equal(book.benchOf("ETH-USD")?.until, 10_000);
});

test("one open position blocks a second name on the book", () => {
  const book = new Book();
  book.sync({ symbol: "ETH-USD", qty: 1, avgPrice: 100 }, 5);
  assert.equal(book.hasOpen(), true);
  book.sync({ symbol: "ETH-USD", qty: 1, avgPrice: 100 }, 9);
  assert.equal(book.openPosition()?.openedAt, 5);
  book.sync(null, 10);
  assert.equal(book.hasOpen(), false);
});
