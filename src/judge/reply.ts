import type { RawAnswers } from "../policy/decide.js";

export interface TokenUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

export type JudgeFailureStatus =
  | "malformed_question"
  | "rate_limited"
  | "block_deadline"
  | "unauthorized"
  | "unavailable";

/** Raw answers only. This object has no trading action. */
export type JudgeReply =
  | { ok: true; model: string; answers: RawAnswers; usage: TokenUsage }
  | { ok: false; status: JudgeFailureStatus; retryable: boolean };
