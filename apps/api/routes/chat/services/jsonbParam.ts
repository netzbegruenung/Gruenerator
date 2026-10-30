/**
 * Serialise a value for a jsonb bind (`chat_messages.tool_results`). Tool
 * output and user text reach that column after many UTF-16 cuts (`slice`/
 * `substring` on snippets, excerpts, summaries); one cut through an emoji
 * leaves a lone surrogate, which `JSON.stringify` writes as `\udXXX` and
 * Postgres rejects with 22P02 — the whole write fails (#5017). `\u0000` is the
 * other escape jsonb refuses (22P05). Repaired here, at the write, instead of
 * at every cut: lone surrogates become U+FFFD, NUL is dropped.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function toJsonbParam(value: object | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'string' ? v.replace(LONE_SURROGATE, '\uFFFD').replaceAll('\u0000', '') : v
  );
}

/**
 * The same repair for a text bind (`chat_messages.content`): Postgres rejects
 * NUL in any text value with 22021, and `withMessageWriteRetry` would replay
 * the identical payload and lose the turn (#5175). Lone surrogates need no
 * repair here — the driver already writes them as U+FFFD.
 */
export function toTextParam<T extends string | null>(value: T): T {
  return (value === null ? value : value.replaceAll('\u0000', '')) as T;
}
