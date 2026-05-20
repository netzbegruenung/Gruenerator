/**
 * Linkup Service
 *
 * Thin client around the Linkup agentic-search API (https://docs.linkup.so).
 * Two modes mapped 1:1 to our two intents:
 *   - webSearch  → depth=standard, outputType=searchResults  (replaces SearXNG)
 *   - deepResearch → depth=deep, outputType=sourcedAnswer    (replaces our orchestrator)
 *
 * Gated by env.LINKUP_API_KEY presence — getLinkupService() returns null when
 * the key is unset, leaving existing code paths intact.
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { withRetry } from './searchRetryStrategy.js';

const log = createLogger('Linkup');

const LINKUP_API_BASE = 'https://api.linkup.so/v1';
const LINKUP_TIMEOUT_MS = 60_000;

export interface LinkupSource {
  name: string;
  url: string;
  snippet: string;
  favicon?: string;
}

export interface LinkupSearchResult {
  name: string;
  url: string;
  content: string;
  type?: string;
}

export interface LinkupSearchResultsResponse {
  results: LinkupSearchResult[];
}

export interface LinkupSourcedAnswerResponse {
  answer: string;
  sources: LinkupSource[];
}

export type LinkupLocale = 'de' | 'at' | 'eu';

export class LinkupService {
  constructor(private readonly apiKey: string) {}

  /** standard depth, searchResults output — drop-in for SearXNG. */
  async webSearch(params: {
    query: string;
    maxResults?: number;
    fromDate?: string;
  }): Promise<LinkupSearchResultsResponse> {
    return this.call<LinkupSearchResultsResponse>('/search', {
      q: params.query,
      depth: 'standard',
      outputType: 'searchResults',
      ...(params.maxResults ? { maxResults: params.maxResults } : {}),
      ...(params.fromDate ? { fromDate: params.fromDate } : {}),
    });
  }

  /** deep depth, sourcedAnswer output — replaces the research orchestrator. */
  async deepResearch(params: {
    question: string;
    locale?: LinkupLocale;
  }): Promise<LinkupSourcedAnswerResponse> {
    const prompt = buildDeepResearchPrompt(params.question, params.locale);
    return this.call<LinkupSourcedAnswerResponse>('/search', {
      q: prompt,
      depth: 'deep',
      outputType: 'sourcedAnswer',
    });
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${LINKUP_API_BASE}${path}`;
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LINKUP_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Linkup ${res.status}: ${text.slice(0, 200)}`);
          }
          return (await res.json()) as T;
        } finally {
          clearTimeout(timeout);
        }
      },
      { maxRetries: 1, delayMs: 500, label: 'Linkup' }
    );
  }
}

function buildDeepResearchPrompt(question: string, locale?: LinkupLocale): string {
  const localeHint =
    locale === 'de'
      ? 'Fokussiere dich auf deutsche Quellen und Kontext (Deutschland).'
      : locale === 'at'
        ? 'Fokussiere dich auf österreichische Quellen und Kontext (Österreich).'
        : locale === 'eu'
          ? 'Fokussiere dich auf europäische Quellen und Kontext (EU).'
          : '';
  return [
    `Du bist Recherche-Assistent für die Partei Bündnis 90/Die Grünen.`,
    `Beantworte folgende Frage gründlich auf Deutsch:`,
    ``,
    question,
    ``,
    localeHint,
    ``,
    `Strukturiere die Antwort mit Markdown-Überschriften (## ...) und gib für jede`,
    `zentrale Aussage einen Inline-Quellennachweis im Format [N] an (1-basiert, in der`,
    `Reihenfolge der Quellenliste). Vermeide Halluzinationen. Verwende Genderstern`,
    `(z.B. Politiker*innen) und das informelle "du".`,
  ]
    .filter(Boolean)
    .join('\n');
}

let _instance: LinkupService | null = null;

/**
 * Returns a singleton LinkupService when LINKUP_API_KEY is set, null otherwise.
 * Callers branch on null to fall through to existing SearXNG / orchestrator paths.
 */
export function getLinkupService(): LinkupService | null {
  if (!env.LINKUP_API_KEY) return null;
  if (!_instance) {
    _instance = new LinkupService(env.LINKUP_API_KEY);
    log.info('[Linkup] Service initialized');
  }
  return _instance;
}

/** Test-only: reset the singleton. Used by vitest's beforeEach. */
export function _resetLinkupServiceForTests(): void {
  _instance = null;
}
