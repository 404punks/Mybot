import { isPinnedModel, PINNED_MODEL } from "../pinned.js";
import type { RiskCheck, Side } from "../types.js";

const issued = new Set<object>();

export interface RiskConfig {
  maxPositionQty: number;
  /** Quote currency. A day at or below the negative of this blocks new exposure. */
  dailyLossLimit: number;
  /** Absolute notional divided by equity. */
  leverageCap: number;
  feeBps: number;
  gasQuote: number;
  /** Round-trip cost at or above this, in bps, blocks a new position. */
  referenceEdgeBps: number;
  ranges: Record<string, { min: number; max: number }>;
}

export const DEFAULT_RISK: RiskConfig = {
  maxPositionQty: 1,
  dailyLossLimit: 100,
  leverageCap: 1,
  feeBps: 4,
  gasQuote: 0,
  referenceEdgeBps: 20,
  ranges: {},
};

export interface RiskFacts {
  symbol: string;
  side: Side;
  qty: number;
  mid: number;
  spreadBps: number;
  equity: number;
  positionQty: number;
  dailyPnl: number;
  model: string | null;
  config: RiskConfig;
}

export interface RiskClearance {
  decisionId: string;
  symbol: string;
  side: Side;
  qty: number;
  model: string;
}

export class RiskVetoError extends Error {
  readonly check: RiskCheck;
  constructor(check: RiskCheck) {
    super(`risk veto: ${check}`);
    this.name = "RiskVetoError";
    this.check = check;
  }
}

/**
 * First failing hard check, or null. There is no override argument.
 * Model output is only consulted as the version string on `model`.
 */
export function firstVeto(facts: RiskFacts): RiskCheck | null {
  return modelVeto(facts.model) ?? preModelVeto(facts);
}

/** Checks that do not need a model response. Used before spending a Jev call. */
export function preModelVeto(facts: RiskFacts): RiskCheck | null {
  if (!rangeOk(facts)) return "range_guard";
  if (!positionOk(facts)) return "max_position";
  if (!leverageOk(facts)) return "leverage_cap";
  if (!dailyLossOk(facts)) return "daily_loss";
  if (!costsOk(facts)) return "fees_plus_gas";
  return null;
}

export function modelVeto(model: string | null): RiskCheck | null {
  return isPinnedModel(model) ? null : "model_version";
}

export function clearOrder(facts: RiskFacts, order: RiskClearance): RiskClearance {
  const veto = firstVeto(facts);
  if (veto) throw new RiskVetoError(veto);
  if (
    facts.symbol !== order.symbol ||
    facts.side !== order.side ||
    facts.qty !== order.qty ||
    facts.model !== order.model ||
    order.model !== PINNED_MODEL
  ) {
    throw new RiskVetoError("model_version");
  }
  const clearance: RiskClearance = {
    decisionId: order.decisionId,
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    model: order.model,
  };
  issued.add(clearance);
  return clearance;
}

/** Paper broker calls this. A handmade object is not in the issued set. */
export function consumeClearance(clearance: RiskClearance, order: RiskClearance): void {
  if (!issued.delete(clearance)) throw new Error("risk clearance was not issued");
  if (
    clearance.decisionId !== order.decisionId ||
    clearance.symbol !== order.symbol ||
    clearance.side !== order.side ||
    clearance.qty !== order.qty ||
    clearance.model !== order.model
  ) {
    throw new Error("order does not match risk clearance");
  }
}

export function roundTripBps(facts: RiskFacts): number {
  const notional = facts.qty * facts.mid;
  if (!(notional > 0)) return Number.POSITIVE_INFINITY;
  const gasBps = (facts.config.gasQuote / notional) * 10_000;
  return facts.spreadBps + 2 * facts.config.feeBps + gasBps;
}

function rangeOk(facts: RiskFacts): boolean {
  if (!(facts.mid > 0) || !Number.isFinite(facts.spreadBps) || facts.spreadBps < 0) return false;
  const range = facts.config.ranges[facts.symbol];
  if (!range) return false;
  return facts.mid >= range.min && facts.mid <= range.max;
}

function nextQty(facts: RiskFacts): number {
  const signed = facts.side === "buy" ? facts.qty : -facts.qty;
  return facts.positionQty + signed;
}

function increasesExposure(facts: RiskFacts): boolean {
  return Math.abs(nextQty(facts)) > Math.abs(facts.positionQty);
}

function positionOk(facts: RiskFacts): boolean {
  if (!(facts.qty > 0)) return false;
  return Math.abs(nextQty(facts)) <= facts.config.maxPositionQty + 1e-12;
}

function leverageOk(facts: RiskFacts): boolean {
  if (!(facts.equity > 0) || !(facts.mid > 0)) return false;
  const notional = Math.abs(nextQty(facts)) * facts.mid;
  return notional / facts.equity <= facts.config.leverageCap + 1e-12;
}

function dailyLossOk(facts: RiskFacts): boolean {
  if (!increasesExposure(facts)) return true;
  return facts.dailyPnl > -facts.config.dailyLossLimit;
}

function costsOk(facts: RiskFacts): boolean {
  const costBps = roundTripBps(facts);
  if (!Number.isFinite(costBps)) return false;
  if (!increasesExposure(facts)) {
    const notional = Math.abs(facts.positionQty) * facts.mid;
    const costQuote = (costBps / 10_000) * Math.max(facts.qty * facts.mid, 0);
    return costQuote < notional;
  }
  return costBps < facts.config.referenceEdgeBps;
}
