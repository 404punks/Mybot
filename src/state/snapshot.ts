import { estimateTokens, TOKEN_BUDGET } from "./tokens.js";

export interface Trade {
  ts: number;
  price: number;
  size: number;
}

export interface TopBook {
  ts: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
}

export interface TimedQty {
  ts: number;
  qty: number;
}

export interface TimedEquity {
  ts: number;
  equity: number;
}

export interface Windows {
  shortMs: number;
  mediumMs: number;
  longMs: number;
}

export const DEFAULT_WINDOWS: Windows = {
  shortMs: 60_000,
  mediumMs: 300_000,
  longMs: 1_800_000,
};

/** Units a person needs in order to read the numbers. Kept short on purpose. */
export const SNAPSHOT_UNITS = {
  imbalance: "-1 ask to +1 bid, top of book",
  realized_vol: "stdev of trade log returns over the long window",
  ret: "log return of mid over short, medium, and long",
  inventory: "signed position in units",
  drawdown: "fraction below peak equity",
} as const;

export interface Snapshot {
  symbol: string;
  as_of_ms: number;
  mid: number;
  spread_bps: number;
  imbalance: number;
  realized_vol: number;
  ret: { short: number; medium: number; long: number };
  inventory: number;
  drawdown: number;
  windows_ms: { short: number; medium: number; long: number };
  units: typeof SNAPSHOT_UNITS;
}

export interface SnapshotInput {
  symbol: string;
  /** Exclusive cutoff. Points at or after this time are ignored. */
  decisionTs: number;
  trades: readonly Trade[];
  books: readonly TopBook[];
  inventory: readonly TimedQty[];
  equity: readonly TimedEquity[];
  windows: Windows;
}

export type SnapshotFailure = "incomplete_snapshot" | "over_token_budget" | "non_finite";

export type SnapshotBuild =
  | { ok: true; snapshot: Snapshot; tokens: number }
  | { ok: false; reason: SnapshotFailure };

export function buildSnapshot(input: SnapshotInput): SnapshotBuild {
  const { decisionTs, windows } = input;
  if (!(windows.shortMs > 0 && windows.shortMs < windows.mediumMs && windows.mediumMs < windows.longMs)) {
    return { ok: false, reason: "incomplete_snapshot" };
  }
  if (!Number.isFinite(decisionTs)) return { ok: false, reason: "non_finite" };

  const books = input.books.filter((row) => row.ts < decisionTs);
  const trades = input.trades.filter((row) => row.ts < decisionTs);
  const inventoryRows = input.inventory.filter((row) => row.ts < decisionTs);
  const equityRows = input.equity.filter((row) => row.ts < decisionTs);

  const book = last(books);
  const inventory = last(inventoryRows);
  if (!book || !inventory) return { ok: false, reason: "incomplete_snapshot" };
  if (!positive(book.bid) || !positive(book.ask) || book.bid >= book.ask) {
    return { ok: false, reason: "non_finite" };
  }
  if (!positive(book.bidSize + book.askSize) || !Number.isFinite(inventory.qty)) {
    return { ok: false, reason: "non_finite" };
  }

  const mid = (book.bid + book.ask) / 2;
  const spreadBps = ((book.ask - book.bid) / mid) * 10_000;
  const imbalance = (book.bidSize - book.askSize) / (book.bidSize + book.askSize);

  const short = windowReturn(books, decisionTs, windows.shortMs);
  const medium = windowReturn(books, decisionTs, windows.mediumMs);
  const long = windowReturn(books, decisionTs, windows.longMs);
  if (short === null || medium === null || long === null) {
    return { ok: false, reason: "incomplete_snapshot" };
  }

  const vol = realizedVol(
    trades.filter((row) => row.ts >= decisionTs - windows.longMs),
  );
  const drawdown = peakDrawdown(equityRows);
  if (vol === null || drawdown === null) return { ok: false, reason: "incomplete_snapshot" };

  const snapshot: Snapshot = {
    symbol: input.symbol,
    as_of_ms: book.ts,
    mid: compact(mid),
    spread_bps: compact(spreadBps),
    imbalance: compact(imbalance),
    realized_vol: compact(vol),
    ret: { short: compact(short), medium: compact(medium), long: compact(long) },
    inventory: compact(inventory.qty),
    drawdown: compact(drawdown),
    windows_ms: { short: windows.shortMs, medium: windows.mediumMs, long: windows.longMs },
    units: SNAPSHOT_UNITS,
  };

  if (!snapshotFinite(snapshot)) return { ok: false, reason: "non_finite" };
  const tokens = estimateTokens(snapshot);
  if (tokens >= TOKEN_BUDGET) return { ok: false, reason: "over_token_budget" };
  return { ok: true, snapshot, tokens };
}

function windowReturn(books: readonly TopBook[], decisionTs: number, windowMs: number): number | null {
  const now = last(books);
  const anchor = last(books.filter((row) => row.ts < decisionTs - windowMs));
  if (!now || !anchor) return null;
  if (anchor.ts < decisionTs - 2 * windowMs) return null;
  const midNow = (now.bid + now.ask) / 2;
  const midThen = (anchor.bid + anchor.ask) / 2;
  if (!positive(midNow) || !positive(midThen)) return null;
  return Math.log(midNow / midThen);
}

function realizedVol(trades: readonly Trade[]): number | null {
  const prices = trades.filter((row) => positive(row.price)).map((row) => row.price);
  if (prices.length < 3) return null;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const next = prices[i];
    if (prev === undefined || next === undefined) return null;
    returns.push(Math.log(next / prev));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

function peakDrawdown(rows: readonly TimedEquity[]): number | null {
  if (rows.length === 0) return null;
  let peak = -Infinity;
  let current = Number.NaN;
  for (const row of rows) {
    if (!Number.isFinite(row.equity) || row.equity <= 0) return null;
    current = row.equity;
    if (row.equity > peak) peak = row.equity;
  }
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(current)) return null;
  return (peak - current) / peak;
}

function last<T extends { ts: number }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (best === null || row.ts >= best.ts) best = row;
  }
  return best;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function compact(value: number): number {
  const rounded = Number(value.toPrecision(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function snapshotFinite(snapshot: Snapshot): boolean {
  const values = [
    snapshot.as_of_ms,
    snapshot.mid,
    snapshot.spread_bps,
    snapshot.imbalance,
    snapshot.realized_vol,
    snapshot.ret.short,
    snapshot.ret.medium,
    snapshot.ret.long,
    snapshot.inventory,
    snapshot.drawdown,
  ];
  return values.every((value) => Number.isFinite(value));
}
