export type Mode = "shadow" | "paper";

export type Action = "open_long" | "open_short" | "close" | "hold";

export type BotName = "gambler" | "house" | "spy";

export const BOTS = ["gambler", "house", "spy"] as const satisfies readonly BotName[];

export type Side = "buy" | "sell";

export type Stage = "free_cut" | "one_call" | "hard_facts" | "jev" | "final_pick";

export type CheckId =
  | "incomplete_snapshot"
  | "over_token_budget"
  | "non_finite"
  | "benched"
  | "position_already_open"
  | "stale_book"
  | "too_close_to_block"
  | "no_equity"
  | "range_guard"
  | "fees_plus_gas"
  | "daily_loss"
  | "leverage_cap"
  | "max_position"
  | "block_deadline"
  | "rate_limited"
  | "malformed_question"
  | "model_version"
  | "jev_unavailable"
  | "below_threshold"
  | "not_selected"
  | "ambiguous";

export const RISK_CHECKS = [
  "max_position",
  "daily_loss",
  "leverage_cap",
  "range_guard",
  "fees_plus_gas",
  "model_version",
] as const;

export type RiskCheck = (typeof RISK_CHECKS)[number];

export function isRiskCheck(check: CheckId): check is RiskCheck {
  return (RISK_CHECKS as readonly string[]).includes(check);
}
