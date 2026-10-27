import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import type { Snapshot } from "../state/snapshot.js";
import type { BotName } from "../types.js";
import { BOTS } from "../types.js";
import { bearer, secretsMatch } from "./auth.js";
import { askBattery } from "./typesafe.js";

const BODY_LIMIT = 65_536;

export interface JudgeServer {
  url: string;
  close(): Promise<void>;
}

export async function startJudge(opts: {
  client: TypeSafeClient;
  deskSecret: string;
  port?: number;
  host?: string;
  now?: () => number;
}): Promise<JudgeServer> {
  const host = opts.host ?? "127.0.0.1";
  const now = opts.now ?? Date.now;
  const server = createServer((req, res) => {
    void handle(req, res, opts.client, opts.deskSecret, now).catch(() => {
      send(res, 500, { error: "unavailable", retryable: false });
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(opts.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("judge failed to bind");
  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  client: TypeSafeClient,
  deskSecret: string,
  now: () => number,
): Promise<void> {
  if (req.method !== "POST" || req.url !== "/v1/judge") {
    send(res, 404, { error: "not_found", retryable: false });
    return;
  }
  if (!secretsMatch(bearer(req.headers.authorization), deskSecret)) {
    send(res, 401, { error: "unauthorized", retryable: false });
    return;
  }
  const parsed = parseBody(await readBody(req));
  if (!parsed) {
    send(res, 422, { error: "malformed_question", retryable: false });
    return;
  }
  const remaining = parsed.deadlineMs - now();
  if (remaining <= 0) {
    send(res, 408, { error: "block_deadline", retryable: false });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const reply = await askBattery(client, parsed.bot, parsed.state, controller.signal, remaining);
    if (!reply.ok) {
      const status = statusFor(reply.status);
      send(res, status, { error: reply.status, retryable: reply.retryable });
      return;
    }
    send(res, 200, { model: reply.model, answers: reply.answers, usage: reply.usage });
  } finally {
    clearTimeout(timer);
  }
}

function statusFor(status: string): number {
  if (status === "malformed_question") return 422;
  if (status === "rate_limited") return 429;
  if (status === "block_deadline") return 408;
  if (status === "unauthorized") return 401;
  return 502;
}

function parseBody(raw: string): { bot: BotName; state: Snapshot; decisionId: string; deadlineMs: number } | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.decisionId !== "string" || body.decisionId.length === 0 || body.decisionId.length > 80) return null;
  if (typeof body.bot !== "string" || !(BOTS as readonly string[]).includes(body.bot)) return null;
  if (typeof body.deadlineMs !== "number" || !Number.isFinite(body.deadlineMs)) return null;
  if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) return null;
  return {
    bot: body.bot as BotName,
    state: body.state as Snapshot,
    decisionId: body.decisionId,
    deadlineMs: body.deadlineMs,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BODY_LIMIT) throw new Error("body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  res.end(json);
}
