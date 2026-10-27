import type { Snapshot } from "../state/snapshot.js";
import type { Action } from "../types.js";
import { THRESHOLDS } from "./thresholds.js";
import { CLOSE_WEIGHTS, NAMED_YES, OPEN_WEIGHTS } from "./weights.js";

export interface RawChoice {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface RawNoul {
  type: "noul";
  noul: number;
}

export interface RawScore {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export type RawAnswer = RawChoice | RawNoul | RawScore;
export type RawAnswers = Record<string, RawAnswer>;

export interface BotReads {
  gambler: RawAnswers;
  house: RawAnswers;
  spy: RawAnswers;
}

export interface OpenPosition {
  symbol: string;
  qty: number;
}

export interface DecisionScores {
  scores: Record<Action, number>;
  thresholds: Record<Action, number>;
  action: Action;
  reason: "selected" | "below_threshold" | "ambiguous";
  margin: number;
}

const TIE = 1e-9;

export function decide(input: {
  snapshot: Snapshot;
  bots: BotReads;
  position: OpenPosition | null;
  scoreLevels?: number;
}): DecisionScores {
  const levels = input.scoreLevels ?? 4;
  const openLong = input.position ? 0 : openScore(1, input);
  const openShort = input.position ? 0 : openScore(-1, input);
  const close = input.position ? closeScore(input, levels) : 0;
  const hold = clamp01(1 - Math.max(openLong, openShort, close));
  const scores = { open_long: openLong, open_short: openShort, close, hold };
  const picked = pick(scores, input.position !== null);
  return { scores, thresholds: { ...THRESHOLDS }, ...picked };
}

function openScore(direction: 1 | -1, input: { snapshot: Snapshot; bots: BotReads }): number {
  if (sign(input.snapshot.ret.short) !== direction) return 0;
  const agrees = sign(input.snapshot.imbalance) === direction;
  const g = input.bots.gambler;
  const h = input.bots.house;
  const s = input.bots.spy;
  const continuation = namedChoice(g, "tape_shape", "tape_shape_named", "continuation");
  const crowded = noulOf(g, "crowded") ?? 1;
  const oneSided = noulOf(g, "one_sided") ?? 0;
  const bookAgrees = namedChoice(s, "disagreement", "disagreement_named", "book_agrees");
  const push = noulOf(s, "push_through_spread") ?? 0;
  const stretched = namedChoice(
    h,
    "stretch",
    "stretch_named",
    direction === 1 ? "stretched_up" : "stretched_down",
  );
  const jumpy = namedChoice(s, "vol_regime", "vol_regime_named", "jumpy");
  const spreadPays = noulOf(h, "spread_pays") ?? 1;
  const w = OPEN_WEIGHTS;
  const support =
    w.continuation * continuation +
    w.notCrowded * (1 - crowded) +
    w.oneSidedAgrees * (agrees ? oneSided : 0) +
    w.bookAgrees * (agrees ? bookAgrees : 0) +
    w.pushThrough * push;
  const penalty = w.stretchedWithMove * stretched + w.jumpy * jumpy + w.spreadPays * spreadPays;
  return clamp01(support - penalty);
}

function closeScore(input: { snapshot: Snapshot; bots: BotReads; position: OpenPosition | null }, levels: number): number {
  const position = input.position;
  if (!position || position.qty === 0) return 0;
  const g = input.bots.gambler;
  const h = input.bots.house;
  const s = input.bots.spy;
  const snap = namedChoice(g, "tape_shape", "tape_shape_named", "snap_back");
  const stretchedAgainst = namedChoice(
    h,
    "stretch",
    "stretch_named",
    position.qty > 0 ? "stretched_down" : "stretched_up",
  );
  const fights = namedChoice(s, "disagreement", "disagreement_named", "book_fights_tape");
  const pressure = scoreUnit(h, "inventory_pressure", levels);
  const crowded = noulOf(g, "crowded") ?? 0;
  const w = CLOSE_WEIGHTS;
  return clamp01(
    w.snapBack * snap +
      w.stretchedAgainst * stretchedAgainst +
      w.bookFights * fights +
      w.inventoryPressing * pressure +
      w.crowded * crowded,
  );
}

function pick(
  scores: Record<Action, number>,
  inPosition: boolean,
): { action: Action; reason: DecisionScores["reason"]; margin: number } {
  if (inPosition) {
    const margin = scores.close - THRESHOLDS.close;
    if (scores.close >= THRESHOLDS.close) return { action: "close", reason: "selected", margin };
    return { action: "hold", reason: "below_threshold", margin: scores.hold - THRESHOLDS.hold };
  }
  const longOk = scores.open_long >= THRESHOLDS.open_long;
  const shortOk = scores.open_short >= THRESHOLDS.open_short;
  const longMargin = scores.open_long - THRESHOLDS.open_long;
  const shortMargin = scores.open_short - THRESHOLDS.open_short;
  if (longOk && shortOk && Math.abs(longMargin - shortMargin) <= TIE) {
    return { action: "hold", reason: "ambiguous", margin: 0 };
  }
  if (longOk && (!shortOk || longMargin > shortMargin)) {
    return { action: "open_long", reason: "selected", margin: longMargin };
  }
  if (shortOk && (!longOk || shortMargin > longMargin)) {
    return { action: "open_short", reason: "selected", margin: shortMargin };
  }
  return { action: "hold", reason: "below_threshold", margin: scores.hold - THRESHOLDS.hold };
}

function namedChoice(answers: RawAnswers, choiceId: string, namedId: string, option: string): number {
  const gate = noulOf(answers, namedId);
  if (gate === null || gate < NAMED_YES) return 0;
  return choiceProb(answers, choiceId, option) ?? 0;
}

function noulOf(answers: RawAnswers, id: string): number | null {
  const answer = answers[id];
  if (!answer || answer.type !== "noul" || !Number.isFinite(answer.noul)) return null;
  return clamp01(answer.noul);
}

function choiceProb(answers: RawAnswers, id: string, option: string): number | null {
  const answer = answers[id];
  if (!answer || answer.type !== "choice") return null;
  const probability = answer.probabilities[option];
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return clamp01(probability);
}

function scoreUnit(answers: RawAnswers, id: string, levels: number): number {
  const answer = answers[id];
  if (!answer || answer.type !== "score" || !Number.isFinite(answer.score)) return 0;
  if (levels < 2) return 0;
  return clamp01(answer.score / (levels - 1));
}

function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
