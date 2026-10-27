import type { CheckId, Stage } from "../types.js";

export interface CheckRule {
  stage: Stage;
  /** How many blocks a rejected symbol stays benched. Zero leaves an existing bench alone. */
  benchBlocks: number;
}

export const CHECKS: Record<CheckId, CheckRule> = {
  incomplete_snapshot: { stage: "free_cut", benchBlocks: 1 },
  over_token_budget: { stage: "free_cut", benchBlocks: 1 },
  non_finite: { stage: "free_cut", benchBlocks: 1 },
  benched: { stage: "free_cut", benchBlocks: 0 },
  position_already_open: { stage: "free_cut", benchBlocks: 0 },
  stale_book: { stage: "free_cut", benchBlocks: 2 },
  too_close_to_block: { stage: "one_call", benchBlocks: 1 },
  no_equity: { stage: "one_call", benchBlocks: 1 },
  range_guard: { stage: "hard_facts", benchBlocks: 5 },
  fees_plus_gas: { stage: "hard_facts", benchBlocks: 3 },
  daily_loss: { stage: "hard_facts", benchBlocks: 10 },
  leverage_cap: { stage: "hard_facts", benchBlocks: 5 },
  max_position: { stage: "hard_facts", benchBlocks: 5 },
  block_deadline: { stage: "jev", benchBlocks: 1 },
  rate_limited: { stage: "jev", benchBlocks: 2 },
  malformed_question: { stage: "jev", benchBlocks: 1_000 },
  model_version: { stage: "jev", benchBlocks: 1_000 },
  jev_unavailable: { stage: "jev", benchBlocks: 1 },
  below_threshold: { stage: "final_pick", benchBlocks: 1 },
  not_selected: { stage: "final_pick", benchBlocks: 1 },
  ambiguous: { stage: "final_pick", benchBlocks: 1 },
};

export function benchDurationMs(check: CheckId, blockMs: number): number {
  return CHECKS[check].benchBlocks * blockMs;
}
