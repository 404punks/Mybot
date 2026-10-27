export interface BlockClock {
  blockMs: number;
  blockIndex(ts: number): number;
  nextBlockAt(ts: number): number;
}

export function createClock(blockMs: number, originMs = 0): BlockClock {
  if (!(blockMs > 0)) throw new Error("block length must be positive");
  return {
    blockMs,
    blockIndex(ts: number) {
      return Math.floor((ts - originMs) / blockMs);
    },
    nextBlockAt(ts: number) {
      return originMs + (Math.floor((ts - originMs) / blockMs) + 1) * blockMs;
    },
  };
}
