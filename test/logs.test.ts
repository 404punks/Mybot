import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JsonlLog, readEvents } from "../src/logs/jsonl.js";
import { deskConfig } from "../src/desk/config.js";

test("secrets in a log line are replaced", () => {
  const secret = "desk-secret-value";
  const dir = mkdtempSync(join(tmpdir(), "desk-log-"));
  const path = join(dir, "desk.jsonl");
  const log = new JsonlLog(path, [secret]);
  log.write({
    kind: "rejection",
    ts: 1,
    decisionId: "d",
    symbol: "ETH-USD",
    stage: "jev",
    check: "jev_unavailable",
    detail: `leaked ${secret} and Bearer ${secret}`,
  });
  const text = readEvents(path).map((event) => JSON.stringify(event)).join("\n");
  assert.equal(text.includes(secret), false);
  assert.match(text, /\[redacted\]/);
});

test("the desk refuses to start when the Jev key is in its environment", () => {
  const key = "typesafe-test-key";
  assert.throws(
    () => deskConfig({ DESK_MODE: "shadow", DESK_SECRET: "desk-secret-value", TYPESAFE_API_KEY: key }),
    /judge/,
  );
  try {
    deskConfig({ DESK_MODE: "shadow", DESK_SECRET: "desk-secret-value", TYPESAFE_API_KEY: key });
  } catch (err) {
    assert.equal(String(err).includes(key), false);
  }
});
