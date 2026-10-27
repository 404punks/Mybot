import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

test("production code does not name a floating model alias or a venue order path", () => {
  const src = files("src");
  for (const path of src) {
    const text = readFileSync(path, "utf8");
    assert.equal(text.includes("jev-latest"), false, path);
    assert.equal(text.includes("withdraw"), false, path);
  }
  const sdk = src.filter((path) => textOf(path).includes("@typesafe-ai/sdk"));
  assert.deepEqual(sdk.sort(), ["src/judge/server.ts", "src/judge/typesafe.ts", "src/questions/sdk.ts"]);
  const callers = src.filter((path) => /systemOne|new TypeSafeClient/.test(textOf(path)));
  assert.deepEqual(callers, ["src/judge/typesafe.ts"]);
  const key = src.filter((path) => textOf(path).includes("TYPESAFE_API_KEY"));
  assert.deepEqual(key.sort(), ["src/desk/config.ts", "src/judge/config.ts", "src/judge/typesafe.ts"]);
});

function textOf(path: string): string {
  return readFileSync(path, "utf8");
}
