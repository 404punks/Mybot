import type { Action } from "../types.js";

/**
 * What being wrong costs, in basis points of notional.
 * Opening wrong pays the stop plus fees plus gas.
 * Closing wrong gives back part of an open edge.
 * Holding wrong misses a smaller edge.
 * These are starting costs, not figures fit to a tape.
 */
export const ACTION_COSTS_BPS = {
  open_long: 25,
  open_short: 25,
  close: 8,
  hold: 4,
} as const satisfies Record<Action, number>;

/** The edge a cost is compared with. A larger cost demands a higher score. */
export const REFERENCE_EDGE_BPS = 8;

/** 0.5 when the cost is zero, and closer to 1 as the cost grows. */
export function thresholdForCost(wrongCostBps: number): number {
  if (!(wrongCostBps >= 0)) throw new Error("action cost must be non-negative");
  return 0.5 + 0.5 * (wrongCostBps / (wrongCostBps + REFERENCE_EDGE_BPS));
}

export const THRESHOLDS: Record<Action, number> = {
  open_long: thresholdForCost(ACTION_COSTS_BPS.open_long),
  open_short: thresholdForCost(ACTION_COSTS_BPS.open_short),
  close: thresholdForCost(ACTION_COSTS_BPS.close),
  hold: thresholdForCost(ACTION_COSTS_BPS.hold),
};
