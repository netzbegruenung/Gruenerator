/**
 * Recency helpers for date-aware ranking and source-date display.
 *
 * Content quality stays decisive — recency is one mild factor that only applies
 * when a source carries a genuine date. Pure functions (the caller passes `now`)
 * so they are deterministic and unit-testable, mirroring TemporalAnalyzer.ts.
 */

/** Mild defaults (see plan): a year half-life, small additive boost. */
export const DEFAULT_HALF_LIFE_DAYS = 365;
export const DEFAULT_MAX_BOOST = 0.06;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RecencyBoostOptions {
  halfLifeDays?: number | undefined;
  maxBoost?: number | undefined;
}

/**
 * Source-shaped input for {@link resolveSourceDate}. Matches the fields carried
 * on SearchResultInput / ExpandedChunkResult.
 */
export interface DateResolvable {
  published_at?: string | null | undefined;
  created_at?: string | undefined;
  date?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface ResolveDateOptions {
  /**
   * Allow falling back to `created_at` as a genuine date. True only for the
   * user `documents` collection (created_at = upload time). False for system
   * collections, whose created_at is index time — not a real publication date,
   * so timeless docs (Grundsatzprogramme) stay neutral.
   */
  allowCreatedAt?: boolean | undefined;
}

/**
 * Resolve the best *real* date for a source, or null when none exists.
 * Precedence: explicit `date` → `published_at` → metadata published/date →
 * (optionally) `created_at`.
 */
export function resolveSourceDate(
  input: DateResolvable,
  options: ResolveDateOptions = {}
): string | null {
  if (input.date) return input.date;
  if (input.published_at) return input.published_at;

  const meta = input.metadata;
  if (meta) {
    const metaPublished = meta.published_at;
    if (typeof metaPublished === 'string' && metaPublished) return metaPublished;
    const metaDate = meta.date;
    if (typeof metaDate === 'string' && metaDate) return metaDate;
  }

  if (options.allowCreatedAt && input.created_at) return input.created_at;

  return null;
}

/**
 * Mild recency boost in [0, maxBoost], added to a 0–1 similarity score.
 * Exponential decay by age: `maxBoost * 0.5 ** (ageDays / halfLifeDays)`.
 * Returns 0 for null / unparseable / future dates (never penalizes).
 */
export function recencyBoost(
  dateIso: string | null | undefined,
  now: Date,
  options: RecencyBoostOptions = {}
): number {
  if (!dateIso) return 0;

  const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const maxBoost = options.maxBoost ?? DEFAULT_MAX_BOOST;

  const parsed = Date.parse(dateIso);
  if (Number.isNaN(parsed)) return 0;

  const ageDays = (now.getTime() - parsed) / MS_PER_DAY;
  if (ageDays <= 0) return maxBoost; // today or (clock-skew) future → freshest

  const boost = maxBoost * Math.pow(0.5, ageDays / halfLifeDays);
  return Math.max(0, Math.min(maxBoost, boost));
}

/**
 * Format an ISO date for German prompts/UI (e.g. "März 2024"). Returns '' for
 * empty/unparseable input so callers can omit the date cleanly.
 */
export function formatDe(dateIso: string | null | undefined): string {
  if (!dateIso) return '';
  const parsed = Date.parse(dateIso);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toLocaleDateString('de-DE', { year: 'numeric', month: 'long' });
}
