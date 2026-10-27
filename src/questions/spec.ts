import type { BotName } from "../types.js";

export interface ChoiceSpec {
  id: string;
  type: "choice";
  instructions: string;
  criteria: { other: string } & Record<string, string>;
}

export interface NoulSpec {
  id: string;
  type: "noul";
  instructions: string;
  true: string;
  false: string;
}

export interface ScoreSpec {
  id: string;
  type: "score";
  instructions: string;
  criteria: readonly [string, string, ...string[]];
}

export type QuestionSpec = ChoiceSpec | NoulSpec | ScoreSpec;

export interface Battery {
  bot: BotName;
  questions: readonly QuestionSpec[];
}

export function choiceQ(
  id: string,
  instructions: string,
  criteria: { other: string } & Record<string, string>,
): ChoiceSpec {
  if (criteria.other.trim() === "") throw new Error(`${id} is missing an other option`);
  return { id, type: "choice", instructions, criteria };
}

export function noulQ(id: string, instructions: string, yes: string, no: string): NoulSpec {
  return { id, type: "noul", instructions, true: yes, false: no };
}

export function scoreQ(
  id: string,
  instructions: string,
  criteria: readonly [string, string, ...string[]],
): ScoreSpec {
  return { id, type: "score", instructions, criteria };
}

export function assertBattery(battery: Battery): void {
  const ids = new Set<string>();
  if (battery.questions.length === 0) throw new Error(`${battery.bot} battery is empty`);
  for (const question of battery.questions) {
    if (ids.has(question.id)) throw new Error(`${battery.bot} repeats ${question.id}`);
    ids.add(question.id);
    if (question.instructions.trim() === "") throw new Error(`${question.id} has empty instructions`);
    if (question.type === "choice" && question.criteria.other.trim() === "") {
      throw new Error(`${question.id} is missing an other option`);
    }
  }
}
