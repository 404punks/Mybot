import type { RawAnswer, RawAnswers } from "../policy/decide.js";

/** Copy the fields the desk is allowed to read. Drops anything else on the object. */
export function copyAnswers(value: unknown): RawAnswers | null {
  if (!value || typeof value !== "object") return null;
  const answers: RawAnswers = {};
  for (const [id, raw] of Object.entries(value)) {
    const copied = copyAnswer(raw);
    if (!copied) return null;
    answers[id] = copied;
  }
  return answers;
}

export function copyAnswer(value: unknown): RawAnswer | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "noul" && typeof record.noul === "number" && Number.isFinite(record.noul)) {
    return { type: "noul", noul: record.noul };
  }
  if (record.type === "choice" && typeof record.choice === "string" && isProbMap(record.probabilities)) {
    const confidence = typeof record.confidence === "number" ? record.confidence : 0;
    return { type: "choice", choice: record.choice, confidence, probabilities: record.probabilities };
  }
  if (record.type === "score" && typeof record.score === "number" && isProbMap(record.probabilities)) {
    const confidence = typeof record.confidence === "number" ? record.confidence : 0;
    return { type: "score", score: record.score, confidence, probabilities: record.probabilities };
  }
  return null;
}

function isProbMap(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}
