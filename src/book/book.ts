import type { CheckId } from "../types.js";
import { benchDurationMs } from "./bench.js";

export interface OpenBookPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
  openedAt: number;
}

export interface BenchEntry {
  symbol: string;
  check: CheckId;
  since: number;
  until: number;
}

export class Book {
  #open: OpenBookPosition | null = null;
  readonly #bench = new Map<string, BenchEntry>();

  hasOpen(): boolean {
    return this.#open !== null && this.#open.qty !== 0;
  }

  openPosition(): OpenBookPosition | null {
    return this.#open ? { ...this.#open } : null;
  }

  /** Broker position is the source of truth. Keeps the scan lock aligned. */
  sync(position: { symbol: string; qty: number; avgPrice: number } | null, nowMs: number): void {
    if (!position || position.qty === 0) {
      this.#open = null;
      return;
    }
    this.#open = {
      symbol: position.symbol,
      qty: position.qty,
      avgPrice: position.avgPrice,
      openedAt: this.#open?.symbol === position.symbol ? this.#open.openedAt : nowMs,
    };
  }

  isBenched(symbol: string, nowMs: number): boolean {
    const entry = this.#bench.get(symbol);
    if (!entry) return false;
    if (entry.until <= nowMs) {
      this.#bench.delete(symbol);
      return false;
    }
    return true;
  }

  benchOf(symbol: string): BenchEntry | null {
    const entry = this.#bench.get(symbol);
    return entry ? { ...entry } : null;
  }

  bench(symbol: string, check: CheckId, nowMs: number, blockMs: number): void {
    const duration = benchDurationMs(check, blockMs);
    if (duration <= 0) return;
    const until = nowMs + duration;
    const prev = this.#bench.get(symbol);
    if (prev && prev.until >= until) return;
    this.#bench.set(symbol, { symbol, check, since: nowMs, until });
  }
}
