const BEARER = /Bearer\s+\S+/gi;
const SECRET_KEY = /^(?:api[_-]?key|authorization|desk[_-]?secret|password|bearer)$/i;

/** Replace known secrets and credential-shaped fields. Secrets shorter than 8 characters are ignored. */
export function redact(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redact(item, secrets);
    }
    return out;
  }
  return value;
}

export function redactString(value: string, secrets: readonly string[]): string {
  let out = value.replace(BEARER, "Bearer [redacted]");
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    if (out.includes(secret)) out = out.split(secret).join("[redacted]");
  }
  return out;
}
