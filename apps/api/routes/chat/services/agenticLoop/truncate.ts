/**
 * Safety-net truncation for model-facing tool results.
 *
 * The loop must never let one oversized tool result (a long web page, a big MCP
 * blob) blow the context window. This deep-truncates string leaves and caps
 * array lengths; if a result is still too large it falls back to a bounded
 * preview string. It is deliberately generic — search tools already return
 * compact data, so for them this is a no-op.
 */

const PER_FIELD_FLOOR = 400;
const MAX_ARRAY_ITEMS = 20;
const TRUNCATION_MARK = '…[gekürzt]';

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function deepTruncate(value: unknown, perFieldChars: number, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > perFieldChars ? value.slice(0, perFieldChars) + TRUNCATION_MARK : value;
  }
  if (Array.isArray(value)) {
    const capped = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v) => deepTruncate(v, perFieldChars, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      capped.push(`…${value.length - MAX_ARRAY_ITEMS} weitere ausgelassen`);
    }
    return capped;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepTruncate(v, perFieldChars, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Returns a model-safe version of `value` whose JSON serialization is at most
 * ~`maxChars`. Primitives and already-small results pass through untouched.
 */
export function truncateResultForModel(value: unknown, maxChars: number): unknown {
  if (value == null || typeof value !== 'object') return value;

  const json = safeStringify(value);
  if (json.length <= maxChars) return value;

  const perField = Math.max(PER_FIELD_FLOOR, Math.floor(maxChars / 8));
  const truncated = deepTruncate(value, perField) as Record<string, unknown>;
  if (safeStringify(truncated).length <= maxChars) {
    return { ...truncated, _truncated: true };
  }

  return {
    _truncated: true,
    preview: json.slice(0, maxChars),
  };
}
