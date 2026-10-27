import type { RiskClearance } from "../risk/vetoes.js";
import type { Side } from "../types.js";

export interface Mark {
  symbol: string;
  mid: number;
}

export interface Account {
  cash: number;
  equity: number;
  dailyPnl: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
}

export interface OrderRequest {
  decisionId: string;
  symbol: string;
  side: Side;
  qty: number;
  bid: number;
  ask: number;
}

export interface Fill {
  orderId: string;
  decisionId: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  gas: number;
  realizedPnl: number;
  ts: number;
}

/**
 * The surface a venue adapter would implement. This package only constructs
 * the paper broker. Cash cannot leave the account through this interface.
 */
export interface Broker {
  getAccount(mark: Mark): Promise<Account>;
  getPosition(): Promise<Position | null>;
  placeOrder(order: OrderRequest, clearance: RiskClearance): Promise<Fill>;
  cancelOrder(orderId: string): Promise<"not_found">;
}
