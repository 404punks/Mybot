import type { Snapshot } from "../state/snapshot.js";
import type { BotName } from "../types.js";
import { copyAnswers } from "./answers.js";
import type { JudgeReply, TokenUsage } from "./reply.js";

export class JudgeHttpClient {
  readonly #url: string;
  readonly #deskSecret: string;
  readonly #fetch: typeof fetch;

  constructor(opts: { url: string; deskSecret: string; fetchImpl?: typeof fetch }) {
    this.#url = opts.url.replace(/\/$/, "");
    this.#deskSecret = opts.deskSecret;
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  async ask(req: {
    bot: BotName;
    state: Snapshot;
    decisionId: string;
    deadlineMs: number;
    signal: AbortSignal;
  }): Promise<JudgeReply> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#url}/v1/judge`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#deskSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bot: req.bot,
          state: req.state,
          decisionId: req.decisionId,
          deadlineMs: req.deadlineMs,
        }),
        signal: req.signal,
      });
    } catch {
      if (req.signal.aborted) return { ok: false, status: "block_deadline", retryable: false };
      return { ok: false, status: "unavailable", retryable: false };
    }
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, status: "unavailable", retryable: false };
      }
    }
    if (response.status === 200) return parseOk(body);
    return parseErr(response.status, body);
  }
}

function parseOk(body: unknown): JudgeReply {
  if (!body || typeof body !== "object") return { ok: false, status: "unavailable", retryable: false };
  const record = body as Record<string, unknown>;
  if (typeof record.model !== "string") return { ok: false, status: "unavailable", retryable: false };
  const answers = copyAnswers(record.answers);
  if (!answers) return { ok: false, status: "unavailable", retryable: false };
  const usage = record.usage as Partial<TokenUsage> | undefined;
  return {
    ok: true,
    model: record.model,
    answers,
    usage: {
      input_tokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
      output_tokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
    },
  };
}

function parseErr(status: number, body: unknown): JudgeReply {
  const retryable = Boolean(body && typeof body === "object" && (body as { retryable?: unknown }).retryable === true);
  if (status === 422) return { ok: false, status: "malformed_question", retryable: false };
  if (status === 429) return { ok: false, status: "rate_limited", retryable: true };
  if (status === 408) return { ok: false, status: "block_deadline", retryable: false };
  if (status === 401) return { ok: false, status: "unauthorized", retryable: false };
  return { ok: false, status: "unavailable", retryable };
}
