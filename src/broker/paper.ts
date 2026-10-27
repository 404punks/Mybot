import { randomUUID } from "node:crypto";
import { consumeClearance, type RiskClearance } from "../risk/vetoes.js";
import type { Account, Broker, Fill, Mark, OrderRequest, Position } from "./types.js";

export interface PaperConfig {
  cash: number;
  feeBps: number;
  gasQuote: number;
  now?: () => number;
}

/**
 * Fills against the bid and ask the desk already saw. It does not fetch
 * a later price and it does not open a network connection.
 */
export class PaperBroker implements Broker {
  readonly kind = "paper" as const;
  #cash: number;
  #position: Position | null = null;
  #dayStartEquity: number;
  readonly #feeBps: number;
  readonly #gasQuote: number;
  readonly #now: () => number;

  constructor(config: PaperConfig) {
    if (!(config.cash > 0)) throw new Error("paper broker needs positive cash");
    this.#cash = config.cash;
    this.#dayStartEquity = config.cash;
    this.#feeBps = config.feeBps;
    this.#gasQuote = config.gasQuote;
    this.#now = config.now ?? Date.now;
  }

  async getAccount(mark: Mark): Promise<Account> {
    if (this.#position && this.#position.symbol !== mark.symbol) {
      throw new Error("mark symbol does not match the open position");
    }
    if (!(mark.mid > 0)) throw new Error("mark is not positive");
    const equity = this.#cash + (this.#position ? this.#position.qty * mark.mid : 0);
    return { cash: this.#cash, equity, dailyPnl: equity - this.#dayStartEquity };
  }

  async getPosition(): Promise<Position | null> {
    return this.#position ? { ...this.#position } : null;
  }

  async placeOrder(order: OrderRequest, clearance: RiskClearance): Promise<Fill> {
    consumeClearance(clearance, {
      decisionId: order.decisionId,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      model: clearance.model,
    });
    if (!(order.qty > 0) || !(order.bid > 0) || !(order.ask > order.bid)) {
      throw new Error("paper broker refused a bad order");
    }
    const prev = this.#position;
    if (prev && prev.qty !== 0 && prev.symbol !== order.symbol) {
      throw new Error("paper broker allows one open position");
    }
    const price = order.side === "buy" ? order.ask : order.bid;
    const signed = order.side === "buy" ? order.qty : -order.qty;
    const prevQty = prev?.qty ?? 0;
    const nextQty = prevQty + signed;
    if (prevQty !== 0 && nextQty !== 0 && Math.sign(nextQty) !== Math.sign(prevQty)) {
      throw new Error("paper broker does not reverse a position in one order");
    }

    const notional = price * order.qty;
    const fee = notional * (this.#feeBps / 10_000);
    const gas = this.#gasQuote;
    let realized = -(fee + gas);
    if (prev && prevQty !== 0 && Math.sign(signed) !== Math.sign(prevQty)) {
      const closed = Math.min(Math.abs(signed), Math.abs(prevQty));
      const perUnit = prevQty > 0 ? price - prev.avgPrice : prev.avgPrice - price;
      realized += perUnit * closed;
    }

    this.#cash += -signed * price - fee - gas;
    this.#position = nextPosition(order.symbol, prev, signed, price);
    return {
      orderId: randomUUID(),
      decisionId: order.decisionId,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price,
      fee,
      gas,
      realizedPnl: realized,
      ts: this.#now(),
    };
  }

  async cancelOrder(_orderId: string): Promise<"not_found"> {
    return "not_found";
  }
}

function nextPosition(
  symbol: string,
  prev: Position | null,
  signed: number,
  price: number,
): Position | null {
  const prevQty = prev?.qty ?? 0;
  const nextQty = prevQty + signed;
  if (nextQty === 0) return null;
  if (prevQty === 0 || Math.sign(nextQty) !== Math.sign(prevQty)) {
    return { symbol, qty: nextQty, avgPrice: price };
  }
  if (Math.sign(signed) === Math.sign(prevQty)) {
    const avg =
      (Math.abs(prevQty) * (prev?.avgPrice ?? price) + Math.abs(signed) * price) / Math.abs(nextQty);
    return { symbol, qty: nextQty, avgPrice: avg };
  }
  return { symbol, qty: nextQty, avgPrice: prev?.avgPrice ?? price };
}

export function createBroker(kind: string, config: PaperConfig): PaperBroker {
  if (kind !== "paper") {
    throw new Error("This desk places no live orders.");
  }
  return new PaperBroker(config);
}
