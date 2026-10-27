import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
  TypeSafeClient,
  TypeSafeError,
  UnprocessableEntityError,
  type Fetch,
  type RetryPolicy,
} from "@typesafe-ai/sdk";
import type { Snapshot } from "../state/snapshot.js";
import { PINNED_MODEL } from "../pinned.js";
import type { BotName } from "../types.js";
import { questionsFor } from "../questions/index.js";
import { toQuestions } from "../questions/sdk.js";
import { copyAnswers } from "./answers.js";
import type { JudgeReply } from "./reply.js";

const silentLogger = {
  debug(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
};

/**
 * Retry only rate limits and overload. A malformed question (400 or 422)
 * is not in this set, and askBattery does not add a retry loop of its own.
 * Timeouts are not retried: the block will have moved on.
 */
export const JUDGE_RETRY: RetryPolicy = {
  maxRetries: 4,
  backoffInitialMs: 500,
  backoffMaxMs: 8_000,
  backoffJitter: 0.25,
  httpStatuses: new Set([429, 529]),
  respectRetryAfter: true,
  maxRetryAfterMs: 8_000,
  apiConnectionError: true,
  apiTimeoutError: false,
};

export function createTypeSafeClient(apiKey: string, fetchImpl?: Fetch, retry: Partial<RetryPolicy> = JUDGE_RETRY): TypeSafeClient {
  if (apiKey.trim() === "") throw new Error("TYPESAFE_API_KEY is not set");
  return new TypeSafeClient({
    apiKey,
    defaultModel: PINNED_MODEL,
    logLevel: "off",
    logger: silentLogger,
    compression: false,
    fetch: fetchImpl,
    retry,
  });
}

/**
 * One System One call for the bot's whole battery.
 * Returns the response model string unchanged. Does not pick a trade.
 */
export async function askBattery(
  client: TypeSafeClient,
  bot: BotName,
  state: Snapshot,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<JudgeReply> {
  try {
    const response = await client.systemOne(
      {
        model: PINNED_MODEL,
        state: state as unknown as Record<string, string | number | Record<string, string | number>>,
        questions: toQuestions(questionsFor(bot)),
      },
      {
        signal,
        timeout: Math.max(1, timeoutMs),
        retry: JUDGE_RETRY,
      },
    );
    const answers = copyAnswers(response.answers);
    if (!answers) return { ok: false, status: "unavailable", retryable: false };
    return {
      ok: true,
      model: response.model,
      answers,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  } catch (err) {
    return classifyJudgeError(err);
  }
}

export function classifyJudgeError(err: unknown): JudgeReply {
  if (err instanceof APIUserAbortError || err instanceof APITimeoutError) {
    return { ok: false, status: "block_deadline", retryable: false };
  }
  if (err instanceof UnprocessableEntityError || err instanceof BadRequestError) {
    return { ok: false, status: "malformed_question", retryable: false };
  }
  if (isClientValidationError(err)) {
    return { ok: false, status: "malformed_question", retryable: false };
  }
  if (err instanceof RateLimitError || (err instanceof InternalServerError && err.status === 529)) {
    return { ok: false, status: "rate_limited", retryable: true };
  }
  return { ok: false, status: "unavailable", retryable: false };
}

function isClientValidationError(err: unknown): boolean {
  return err instanceof TypeSafeError && !(err instanceof APIError) && !(err instanceof APIConnectionError);
}
