/**
 * Compaction thresholds — leaf module with no service imports, so tests can
 * re-import it (env-override behavior) without spinning up Redis/Postgres.
 *
 * The long-thread eval harness needs compaction to fire within ~10 turns
 * instead of 50+, so the thresholds are env-overridable outside production.
 * An explicit override also wins over the model-aware tiers below.
 */
const DEV_OVERRIDES = process.env.NODE_ENV !== 'production';

function envInt(name: string, fallback: number, min = 1): number {
  if (!DEV_OVERRIDES) return fallback;
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

const hasOverride = (name: string): boolean => {
  if (!DEV_OVERRIDES) return false;
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(n) && n >= 1;
};

// Configuration constants (defaults for 128K+ context models)
export const COMPACTION_THRESHOLD = envInt('CHAT_COMPACTION_THRESHOLD', 50);
export const COMPACTION_TOKEN_THRESHOLD = envInt('CHAT_COMPACTION_TOKEN_THRESHOLD', 24000);
export const KEEP_RECENT = envInt('CHAT_COMPACTION_KEEP_RECENT', 20);
export const RE_COMPACTION_THRESHOLD = envInt('CHAT_RE_COMPACTION_THRESHOLD', 50);
export const SUMMARY_MAX_TOKENS = 800;

/**
 * Model-aware message count limit (lobe-chat pattern).
 * Returns how many recent messages to keep based on context window size.
 * Smaller models need fewer messages to leave room for system prompt + response.
 */
export function getKeepRecent(contextWindowTokens?: number): number {
  if (hasOverride('CHAT_COMPACTION_KEEP_RECENT')) return KEEP_RECENT;
  if (!contextWindowTokens) return KEEP_RECENT;
  if (contextWindowTokens < 16000) return 6;
  if (contextWindowTokens < 32000) return 10;
  if (contextWindowTokens < 64000) return 15;
  return KEEP_RECENT;
}

/**
 * Model-aware compaction threshold.
 * Returns when to trigger compaction based on context window size.
 */
export function getCompactionThreshold(contextWindowTokens?: number): number {
  if (hasOverride('CHAT_COMPACTION_THRESHOLD')) return COMPACTION_THRESHOLD;
  if (!contextWindowTokens) return COMPACTION_THRESHOLD;
  if (contextWindowTokens < 16000) return 15;
  if (contextWindowTokens < 32000) return 25;
  if (contextWindowTokens < 64000) return 35;
  return COMPACTION_THRESHOLD;
}

/**
 * Model-aware token threshold for compaction.
 */
export function getCompactionTokenThreshold(contextWindowTokens?: number): number {
  if (hasOverride('CHAT_COMPACTION_TOKEN_THRESHOLD')) return COMPACTION_TOKEN_THRESHOLD;
  if (!contextWindowTokens) return COMPACTION_TOKEN_THRESHOLD;
  // Use ~40% of context window as token threshold
  return Math.min(Math.floor(contextWindowTokens * 0.4), COMPACTION_TOKEN_THRESHOLD);
}

/**
 * Check if a thread needs compaction based on message count or estimated token usage.
 * Token-based threshold catches conversations with few but very large messages
 * (e.g., pasted articles) that would otherwise lose context before hitting the message count.
 * When contextWindowTokens is provided, uses model-aware thresholds.
 */
export function needsCompaction(
  messageCount: number,
  existingSummary: string | null,
  estimatedTokens?: number,
  contextWindowTokens?: number
): boolean {
  const threshold = getCompactionThreshold(contextWindowTokens);
  const tokenThreshold = getCompactionTokenThreshold(contextWindowTokens);

  if (estimatedTokens && estimatedTokens >= tokenThreshold && !existingSummary) {
    return true;
  }
  if (!existingSummary) {
    return messageCount >= threshold;
  }
  return messageCount >= threshold + RE_COMPACTION_THRESHOLD;
}
