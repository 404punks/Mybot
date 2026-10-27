import assert from "node:assert/strict";
import test from "node:test";
import type { Fetch } from "@typesafe-ai/sdk";
import { PINNED_MODEL } from "../src/pinned.js";
import { questionsFor } from "../src/questions/index.js";
import { JudgeHttpClient } from "../src/judge/client.js";
import { startJudge } from "../src/judge/server.js";
import { askBattery, createTypeSafeClient } from "../src/judge/typesafe.js";
import { readySnapshot, skeletonAnswers } from "./fixtures.js";

const SECRET = "desk-secret-value";
const API_KEY = "typesafe-test-key";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function okBody(model = PINNED_MODEL) {
  return {
    model,
    answers: {
      ...skeletonAnswers("gambler"),
      ...skeletonAnswers("house"),
      ...skeletonAnswers("spy"),
    },
    usage: { input_tokens: 150, output_tokens: 30 },
  };
}

test("a malformed question is not retried and a rate limit backs off", async () => {
  let malformedCalls = 0;
  const malformedFetch: Fetch = async () => {
    malformedCalls += 1;
    return json(422, { error: "malformed question", field: "questions.tape_shape" });
  };
  const client = createTypeSafeClient(API_KEY, malformedFetch, { maxRetries: 5, backoffInitialMs: 1 });
  const snapshot = readySnapshot();
  const bad = await askBattery(client, "gambler", snapshot, new AbortController().signal, 1_000);
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.equal(bad.status, "malformed_question");
  assert.equal(bad.retryable, false);
  assert.equal(malformedCalls, 1);

  let rateCalls = 0;
  let sentModel = "";
  const rateFetch: Fetch = async (_url, init) => {
    rateCalls += 1;
    const raw = typeof init?.body === "string" ? init.body : "";
    sentModel = JSON.parse(raw).model;
    if (rateCalls < 3) return json(429, { error: "slow down" }, { "retry-after": "0" });
    return json(200, okBody());
  };
  const retrying = createTypeSafeClient(API_KEY, rateFetch, {
    maxRetries: 4,
    backoffInitialMs: 1,
    backoffJitter: 0,
  });
  const good = await askBattery(retrying, "gambler", snapshot, new AbortController().signal, 1_000);
  assert.equal(rateCalls, 3);
  assert.equal(sentModel, PINNED_MODEL);
  assert.equal(good.ok, true);
  if (!good.ok) return;
  assert.equal(good.model, PINNED_MODEL);
  assert.equal("action" in good, false);
});

test("the judge returns the model string raw and hides the key from the desk", async () => {
  let sawKey = false;
  const fetchImpl: Fetch = async (_url, init) => {
    const headers = new Headers(init?.headers);
    sawKey = headers.get("authorization") === `Bearer ${API_KEY}`;
    const raw = typeof init?.body === "string" ? init.body : "";
    const body = JSON.parse(raw) as { questions: Record<string, unknown>; model: string };
    assert.equal(body.model, PINNED_MODEL);
    assert.deepEqual(Object.keys(body.questions).sort(), questionsFor("spy").map((q) => q.id).sort());
    return json(200, okBody("jev-1.13.0"));
  };
  const client = createTypeSafeClient(API_KEY, fetchImpl, { maxRetries: 0 });
  const server = await startJudge({ client, deskSecret: SECRET, port: 0 });
  try {
    const desk = new JudgeHttpClient({ url: server.url, deskSecret: SECRET });
    const denied = await new JudgeHttpClient({ url: server.url, deskSecret: "wrong-desk-secret-value" }).ask({
      bot: "spy",
      state: readySnapshot(),
      decisionId: "d",
      deadlineMs: Date.now() + 2_000,
      signal: new AbortController().signal,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.status, "unauthorized");

    const reply = await desk.ask({
      bot: "spy",
      state: readySnapshot(),
      decisionId: "d",
      deadlineMs: Date.now() + 2_000,
      signal: new AbortController().signal,
    });
    assert.equal(sawKey, true);
    assert.equal(reply.ok, true);
    if (!reply.ok) return;
    assert.equal(reply.model, "jev-1.13.0");
    assert.equal(JSON.stringify(reply).includes(API_KEY), false);
    assert.equal("action" in reply, false);
  } finally {
    await server.close();
  }
});

test("a deadline that has already passed never calls Jev", async () => {
  let calls = 0;
  const fetchImpl: Fetch = async () => {
    calls += 1;
    return json(200, okBody());
  };
  const client = createTypeSafeClient(API_KEY, fetchImpl, { maxRetries: 0 });
  const server = await startJudge({
    client,
    deskSecret: SECRET,
    port: 0,
    now: () => 10_000,
  });
  try {
    const reply = await new JudgeHttpClient({ url: server.url, deskSecret: SECRET }).ask({
      bot: "gambler",
      state: readySnapshot(),
      decisionId: "late",
      deadlineMs: 10_000,
      signal: new AbortController().signal,
    });
    assert.equal(calls, 0);
    assert.equal(reply.ok, false);
    if (!reply.ok) assert.equal(reply.status, "block_deadline");
  } finally {
    await server.close();
  }
});

test("an aborted call is a block hold and is not retried", async () => {
  let calls = 0;
  const fetchImpl: Fetch = (_url, init) =>
    new Promise((resolve, reject) => {
      calls += 1;
      const timer = setTimeout(() => resolve(json(200, okBody())), 5_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  const client = createTypeSafeClient(API_KEY, fetchImpl, { maxRetries: 4, backoffInitialMs: 1 });
  const controller = new AbortController();
  const pending = askBattery(client, "house", readySnapshot(), controller.signal, 5_000);
  setTimeout(() => controller.abort(), 20);
  const reply = await pending;
  assert.equal(reply.ok, false);
  if (!reply.ok) {
    assert.equal(reply.status, "block_deadline");
    assert.equal(reply.retryable, false);
  }
  assert.equal(calls, 1);
});
