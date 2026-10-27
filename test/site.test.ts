import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the Vercel site publishes a page for / and does not place an order", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { outputDirectory?: string };
  assert.equal(config.outputDirectory, "public");
  const page = readFileSync("public/index.html", "utf8");
  assert.match(page, /<h1>Desk<\/h1>/);
  assert.match(page, /Paper trading only/);
  assert.match(page, /ETH-USD/);
  assert.match(page, /102\.45/);
  assert.match(page, /ডেস্ক খোলা আছে/);
  assert.equal(page.includes("placeOrder"), false);
  assert.equal(page.includes("TYPESAFE_API_KEY"), false);
});
