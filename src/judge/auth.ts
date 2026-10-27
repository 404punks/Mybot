import { createHash, timingSafeEqual } from "node:crypto";

export function secretsMatch(provided: string, expected: string): boolean {
  if (expected.length < 16) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearer(header: string | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match?.[1] ?? "";
}
