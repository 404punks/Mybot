/** Snapshots sent to Jev stay under this many estimated tokens. */
export const TOKEN_BUDGET = 400;

/**
 * Conservative estimate: one token per four UTF-8 bytes, rounded up.
 * The snapshot builder refuses a payload that reaches the budget.
 */
export function estimateTokens(value: unknown): number {
  const json = JSON.stringify(value);
  const bytes = Buffer.byteLength(json, "utf8");
  return Math.ceil(bytes / 4);
}
