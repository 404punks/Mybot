import { choice, noul, score, type Question, type Questions } from "@typesafe-ai/sdk";
import type { QuestionSpec } from "./spec.js";

/** Map a bot battery onto SDK questions. One object, one System One call. */
export function toQuestions(specs: readonly QuestionSpec[]): Questions {
  const questions: Record<string, Question> = {};
  for (const spec of specs) {
    if (spec.type === "choice") {
      questions[spec.id] = choice(spec.instructions, spec.criteria);
    } else if (spec.type === "noul") {
      questions[spec.id] = noul(spec.instructions, { true: spec.true, false: spec.false });
    } else {
      const [first, second, ...rest] = spec.criteria;
      questions[spec.id] = score(spec.instructions, [first, second, ...rest]);
    }
  }
  return questions;
}
