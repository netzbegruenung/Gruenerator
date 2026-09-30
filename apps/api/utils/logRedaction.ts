const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const SENSITIVE_KEY_RE =
  /^(to|from|email|e-?mail|user_?id|sub|token|access_?token|refresh_?token|id_?token|authorization|cookie|password|secret|payload)$/i;

const MAX_DEPTH = 6;

export function redactString(value: string): string {
  return value.replace(JWT_RE, '[token]').replace(EMAIL_RE, '[email]').replace(UUID_RE, '[id]');
}

/**
 * Returns a scrubbed copy: strings lose emails, JWTs and UUIDs, and values under
 * personal-data keys are dropped. Never mutates the input — the same log record
 * is also written to the console transport, which must stay complete.
 */
export function redactPii(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redactPii(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '[redacted]' : redactPii(v, depth + 1, seen);
  }
  return out;
}
