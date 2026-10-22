/**
 * Compaction thresholds — leaf module with no service imports, so tests can
 * import it without spinning up Redis/Postgres.
 *
 * Every number is a share of the pruning budget of the turn's EFFECTIVE window
 * (the widest lane the turn may move to, see `effectiveContextWindow`). A fixed
 * 24k-token trigger summarised a 128k Gemma thread at 28 % of what fit and left
 * the model 20 messages plus 800 tokens of prose (#4790).
 *
 * The long-thread eval harness needs compaction to fire within a few turns, so
 * the two token figures are env-overridable outside production.
 */
import { getPruningBudget } from './messageHelpers.js';

/** The un-summarised tail triggers compaction at this share of the budget.
 *  Below 1 because the summary is built in the background and lands a turn late. */
const COMPACT_AT_SHARE = 0.7;
/** What stays verbatim behind a fresh summary. The difference to
 *  COMPACT_AT_SHARE is what one summary reads: 0,4 × 180k ≈ 72k on Large 4. */
const TAIL_SHARE = 0.3;
/** Verbatim material carried out of the summarised part (pastes, the latest draft). */
const CARRY_SHARE = 0.2;
/** Chars per token of the estimator the budgets are measured with (TokenCounter). */
const CHARS_PER_ESTIMATED_TOKEN = 4;

export const SUMMARY_MAX_TOKENS = 2000;
/** One summary call's transcript. The heavy lane is Gemma at 128k (budget 86,6k);
 *  a longer delta — a thread that predates these thresholds — is folded in chunks. */
export const SUMMARY_INPUT_MAX_TOKENS = 80_000;

function devOverride(name: string): number | null {
  if (process.env.NODE_ENV === 'production') return null;
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function getCompactionTokenThreshold(contextWindowTokens?: number): number {
  return (
    devOverride('CHAT_COMPACTION_TOKEN_THRESHOLD') ??
    Math.floor(getPruningBudget(contextWindowTokens) * COMPACT_AT_SHARE)
  );
}

export function getTailTokenBudget(contextWindowTokens?: number): number {
  return (
    devOverride('CHAT_COMPACTION_TAIL_TOKENS') ??
    Math.floor(getPruningBudget(contextWindowTokens) * TAIL_SHARE)
  );
}

export function getCarryCharBudget(contextWindowTokens?: number): number {
  return (
    Math.floor(getPruningBudget(contextWindowTokens) * CARRY_SHARE) * CHARS_PER_ESTIMATED_TOKEN
  );
}

/** True once what the model still sees verbatim — everything after the last
 *  summary, or the whole thread before the first — reaches the threshold. */
export function needsCompaction(tailTokens: number, contextWindowTokens?: number): boolean {
  return tailTokens >= getCompactionTokenThreshold(contextWindowTokens);
}
