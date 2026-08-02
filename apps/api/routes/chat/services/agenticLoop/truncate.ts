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

/**
 * Top-level fields whose producing tool already applied its own char budget.
 *
 * `sources` is the numbered source block from the registry, bounded per source
 * by the registering tool's `snippetChars` and — in split mode, where
 * `renderAll()` rebuilds it — again by SOURCE_BLOCK_CHARS across all sources.
 * Handing it to the generic deep-truncation is not a safety net but a second,
 * dumber cap: `perField` is maxChars/8 = 750, so ten sources would collapse into
 * 750 chars TOTAL. In unified mode there is no `renderAll()` later in the turn,
 * so those 750 chars would be the model's entire grounding.
 *
 * What that leaves uncapped is one turn's accumulated `register()` returns in
 * unified mode. Bounded in practice by what a search can produce: the widest is
 * `tiefenrecherche` at ~37.5k chars (3 read pages + 17 snippets), and unified
 * mode is the Mistral lane at 262k tokens — three such calls are ~12 % of it.
 * Split mode, where the smaller lanes live, goes through `renderAll()`.
 *
 * This is why the pre-distillation snippet length of 300 chars was load-bearing
 * by accident: 10 x 300 stayed just under the 6000 ceiling, so the block was
 * never truncated. Raising it without this exemption is a regression, not an
 * improvement.
 */
const PRE_BUDGETED_FIELDS: ReadonlySet<string> = new Set(['sources']);

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
 * ~`maxChars` — except for {@link PRE_BUDGETED_FIELDS}, which pass through
 * whole because their producing tool already bounded them. Primitives and
 * already-small results pass through untouched.
 */
export function truncateResultForModel(
  value: unknown,
  maxChars: number,
  exemptFields: ReadonlySet<string> = PRE_BUDGETED_FIELDS
): unknown {
  if (value == null || typeof value !== 'object') return value;

  const json = safeStringify(value);
  if (json.length <= maxChars) return value;

  // Split off the pre-budgeted fields; only the remainder gets deep-truncated.
  const exempt: Record<string, unknown> = {};
  let rest: unknown = value;
  if (!Array.isArray(value) && exemptFields.size > 0) {
    const others: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (exemptFields.has(k)) exempt[k] = v;
      else others[k] = v;
    }
    if (Object.keys(exempt).length > 0) rest = others;
  }
  const hasExempt = Object.keys(exempt).length > 0;

  const perField = Math.max(PER_FIELD_FLOOR, Math.floor(maxChars / 8));
  const restJson = safeStringify(rest);
  const truncated = deepTruncate(rest, perField) as Record<string, unknown>;
  // Only claim truncation if something was actually cut — an oversized result
  // whose bulk sits in an exempt field lost nothing.
  const changed = safeStringify(truncated) !== restJson;
  const merged = { ...truncated, ...exempt, ...(changed ? { _truncated: true } : {}) };

  if (hasExempt || safeStringify(merged).length <= maxChars) {
    return merged;
  }

  return {
    _truncated: true,
    preview: json.slice(0, maxChars),
  };
}
