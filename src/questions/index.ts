import type { BotName } from "../types.js";
import { gamblerBattery } from "./gambler.js";
import { houseBattery } from "./house.js";
import { spyBattery } from "./spy.js";
import { assertBattery, type Battery, type QuestionSpec } from "./spec.js";

export const BATTERIES: Record<BotName, Battery> = {
  gambler: gamblerBattery,
  house: houseBattery,
  spy: spyBattery,
};

for (const battery of Object.values(BATTERIES)) assertBattery(battery);

export function batteryFor(bot: BotName): Battery {
  return BATTERIES[bot];
}

export function questionsFor(bot: BotName): readonly QuestionSpec[] {
  return BATTERIES[bot].questions;
}
