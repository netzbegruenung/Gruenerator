/**
 * What every tool of a run shares: the budget, the locale, the source ledger.
 *
 * Split out of `tools.ts` so the notebook tool can use the same helpers without
 * the two files importing each other.
 */

import { type NotebookScope } from './notebookScope.js';
import { type ResearchLocale, type RunBudget, type SourceRef } from './types.js';

export interface ToolContext {
  budget: RunBudget;
  locale: ResearchLocale;
  /** Every source the run saw, in first-seen order — the report's source list. */
  sources: Map<string, SourceRef>;
  aiClient?: unknown;
  /** Absent when nothing is in reach; the notebook tool is then not registered. */
  notebooks?: NotebookScope;
  /**
   * The run's deadline, so a tool that WAITS (the GreenPT spacing gate, a retry
   * pause) is cut short with it instead of outliving the run it belongs to.
   */
  signal?: AbortSignal;
  onStep: (label: string, status: 'running' | 'done' | 'failed') => void;
}

/**
 * Austria is an audience, not a toggle: an AT run that silently searches German
 * sources answers the wrong question. `country` is a bias on GreenPT and the
 * Linkup query carries the hint, because that is what each API accepts.
 */
export function localeHint(locale: ResearchLocale): { greenpt: string; queryNote: string } {
  return locale === 'de-AT'
    ? { greenpt: 'de-AT', queryNote: ' (Österreich)' }
    : { greenpt: 'de-DE', queryNote: '' };
}

/**
 * Records a source under an explicit key.
 *
 * The key is the URL for anything from the web, but notebook documents often
 * have none — keying those by URL would collapse every one of them into a
 * single empty-string entry.
 */
export function rememberSource(
  ctx: ToolContext,
  source: { key: string; url: string; title: string; origin?: string }
): void {
  if (!source.key) return;
  if (ctx.sources.has(source.key)) return;
  ctx.sources.set(source.key, {
    url: source.url,
    title: source.title || source.url || source.key,
    ...(source.origin ? { origin: source.origin } : {}),
  });
}

/** Web sources: the URL is both key and address. */
export function remember(ctx: ToolContext, url: string, title: string): void {
  if (!url) return;
  rememberSource(ctx, { key: url, url, title });
}

/** Compact, numbered, one line per hit — cheap in tokens, easy for a model to cite. */
export function formatHits(hits: { url: string; title: string; snippet: string }[]): string {
  if (hits.length === 0) return 'Keine Treffer.';
  return hits
    .map(
      (h, i) =>
        `${i + 1}. ${h.title}\n   URL: ${h.url}\n   ${h.snippet.replace(/\s+/g, ' ').trim()}`
    )
    .join('\n');
}

export function budgetSpent(ctx: ToolContext): string | null {
  if (Date.now() > ctx.budget.softDeadlineAt) {
    return 'Zeitbudget aufgebraucht. Führe keine weiteren Recherchen durch und schreibe jetzt den Bericht aus dem, was du bereits hast.';
  }
  return null;
}
