/**
 * Self-reporting caps for model-facing context.
 *
 * Every truncation that shrinks what a model sees is a silent quality bug
 * waiting to happen: unlike an output cap, there is no provider error and no
 * user-visible symptom — the answer just gets worse. A 500-char cap on replayed
 * tool results sat in the loop for months, cutting five-source research blocks
 * down to one and a half, and nothing anywhere said so.
 *
 * The rule this module enforces: a cap may shrink context, but it may not do so
 * quietly. Nothing is logged while a cap is merely configured — only when it
 * actually binds, so the log stays silent until something is genuinely lost.
 */
import { createLogger } from './logger.js';

const log = createLogger('ContextCap');

/**
 * Apply a character cap, logging once per hit with what was lost.
 *
 * @param text   the model-facing string
 * @param cap    maximum characters to keep
 * @param label  where this cap lives, e.g. `sourceRegistry:snippet`
 * @param ellipsis append `…` so the model can see it was cut (default true)
 */
export function applyContextCap(text: string, cap: number, label: string, ellipsis = true): string {
  if (text.length <= cap) return text;
  const dropped = text.length - cap;
  log.warn(
    `[${label}] cap hit: ${text.length} → ${cap} chars (${dropped} dropped, ` +
      `${Math.round((dropped / text.length) * 100)}%)`
  );
  return ellipsis ? `${text.slice(0, cap)}…` : text.slice(0, cap);
}

/**
 * Report a COUNT cap (top-N results, max array items). Returns the kept slice.
 * Separate from the char version because losing whole sources and losing the
 * tail of one source are different failures and should read differently in logs.
 */
export function applyCountCap<T>(items: readonly T[], cap: number, label: string): T[] {
  if (items.length <= cap) return [...items];
  log.warn(
    `[${label}] count cap hit: ${items.length} → ${cap} items (${items.length - cap} dropped)`
  );
  return items.slice(0, cap);
}
