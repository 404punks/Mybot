import type { Account } from "../broker/types.js";
import type { Snapshot } from "../state/snapshot.js";
import { preModelVeto, type RiskConfig, type RiskFacts } from "../risk/vetoes.js";
import type { CheckId, Side } from "../types.js";

export function staleBook(snapshot: Snapshot, decisionTs: number, staleMs: number): CheckId | null {
  if (decisionTs - snapshot.as_of_ms > staleMs) return "stale_book";
  return null;
}

export function tooClose(deadlineMs: number, nowMs: number, minLeadMs: number): CheckId | null {
  if (deadlineMs - nowMs < minLeadMs) return "too_close_to_block";
  return null;
}

export function equityCheck(account: Account): CheckId | null {
  if (!(account.equity > 0)) return "no_equity";
  return null;
}

export function hardFacts(input: {
  snapshot: Snapshot;
  side: Side;
  qty: number;
  positionQty: number;
  account: Account;
  risk: RiskConfig;
}): CheckId | null {
  return preModelVeto(factsFor(input));
}

export function factsFor(input: {
  snapshot: Snapshot;
  side: Side;
  qty: number;
  positionQty: number;
  account: Account;
  risk: RiskConfig;
  model?: string | null;
}): RiskFacts {
  return {
    symbol: input.snapshot.symbol,
    side: input.side,
    qty: input.qty,
    mid: input.snapshot.mid,
    spreadBps: input.snapshot.spread_bps,
    equity: input.account.equity,
    positionQty: input.positionQty,
    dailyPnl: input.account.dailyPnl,
    model: input.model ?? null,
    config: input.risk,
  };
}
