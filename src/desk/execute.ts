import type { Broker, OrderRequest } from "../broker/types.js";
import type { Account } from "../broker/types.js";
import { Book } from "../book/book.js";
import type { DeskLog } from "../logs/jsonl.js";
import type { Prepared } from "../filter/funnel.js";
import { THRESHOLDS } from "../policy/thresholds.js";
import { clearOrder, firstVeto, RiskVetoError, type RiskConfig } from "../risk/vetoes.js";
import type { Action, Mode } from "../types.js";
import { factsFor } from "../filter/stages.js";

export async function executePick(input: {
  log: DeskLog;
  book: Book;
  broker: Broker;
  prepared: Prepared | null;
  decisionId: string;
  mode: Mode;
  nowMs: number;
  blockMs: number;
  orderQty: number;
  risk: RiskConfig;
  account: Account;
  positionQty: number;
  holdReason: string;
}): Promise<void> {
  const prepared = input.prepared;
  if (!prepared || prepared.scores.action === "hold") {
    input.log.write({
      kind: "decision",
      ts: input.nowMs,
      decisionId: input.decisionId,
      mode: input.mode,
      symbol: prepared?.symbol ?? null,
      policyAction: "hold",
      executed: false,
      reason: prepared?.scores.reason ?? input.holdReason,
      scores: prepared?.scores.scores ?? emptyScores(),
      thresholds: prepared?.scores.thresholds ?? { ...THRESHOLDS },
      model: prepared?.model ?? null,
    });
    return;
  }

  const order = toOrder(prepared, input.decisionId, input.orderQty, input.positionQty);
  if (!order) {
    writeDecision(input, prepared, "hold", false, "no_order");
    return;
  }
  const facts = factsFor({
    snapshot: prepared.snapshot,
    side: order.side,
    qty: order.qty,
    positionQty: input.positionQty,
    account: input.account,
    risk: input.risk,
    model: prepared.model,
  });
  const veto = firstVeto(facts);
  if (veto) {
    input.log.write({
      kind: "veto",
      ts: input.nowMs,
      decisionId: input.decisionId,
      symbol: prepared.symbol,
      check: veto,
    });
    input.book.bench(prepared.symbol, veto, input.nowMs, input.blockMs);
    writeDecision(input, prepared, prepared.scores.action, false, veto);
    return;
  }
  if (input.mode === "shadow") {
    writeDecision(input, prepared, prepared.scores.action, false, "shadow");
    return;
  }
  try {
    const clearance = clearOrder(facts, {
      decisionId: order.decisionId,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      model: prepared.model,
    });
    const fill = await input.broker.placeOrder(order, clearance);
    input.log.write({
      kind: "fill",
      ts: fill.ts,
      decisionId: input.decisionId,
      symbol: fill.symbol,
      side: fill.side,
      qty: fill.qty,
      price: fill.price,
      fee: fill.fee,
      gas: fill.gas,
      realizedPnl: fill.realizedPnl,
    });
    const position = await input.broker.getPosition();
    input.book.sync(position, input.nowMs);
    writeDecision(input, prepared, prepared.scores.action, true, "filled");
  } catch (err) {
    const check = err instanceof RiskVetoError ? err.check : "model_version";
    input.log.write({
      kind: "veto",
      ts: input.nowMs,
      decisionId: input.decisionId,
      symbol: prepared.symbol,
      check,
    });
    writeDecision(input, prepared, prepared.scores.action, false, check);
  }
}

function toOrder(prepared: Prepared, decisionId: string, orderQty: number, positionQty: number): OrderRequest | null {
  const bid = prepared.snapshot.mid * (1 - prepared.snapshot.spread_bps / 2 / 10_000);
  const ask = prepared.snapshot.mid * (1 + prepared.snapshot.spread_bps / 2 / 10_000);
  const action = prepared.scores.action;
  if (action === "open_long") {
    return { decisionId, symbol: prepared.symbol, side: "buy", qty: orderQty, bid, ask };
  }
  if (action === "open_short") {
    return { decisionId, symbol: prepared.symbol, side: "sell", qty: orderQty, bid, ask };
  }
  if (action === "close" && positionQty !== 0) {
    return {
      decisionId,
      symbol: prepared.symbol,
      side: positionQty > 0 ? "sell" : "buy",
      qty: Math.abs(positionQty),
      bid,
      ask,
    };
  }
  return null;
}

function writeDecision(
  input: { log: DeskLog; decisionId: string; mode: Mode; nowMs: number },
  prepared: Prepared,
  policyAction: Action,
  executed: boolean,
  reason: string,
): void {
  input.log.write({
    kind: "decision",
    ts: input.nowMs,
    decisionId: input.decisionId,
    mode: input.mode,
    symbol: prepared.symbol,
    policyAction,
    executed,
    reason,
    scores: prepared.scores.scores,
    thresholds: prepared.scores.thresholds,
    model: prepared.model,
  });
}

function emptyScores(): Record<Action, number> {
  return { open_long: 0, open_short: 0, close: 0, hold: 1 };
}
