/**
 * Eine Seite lesen, die jemand BENANNT hat — die Person per @link oder Text,
 * der Planer aus einem Suchtreffer. Eine Stelle, weil `scrape_url` und der
 * Vorab-Abruf der @link-Seiten (`seedAttachedPages`) dieselbe Prüfung und
 * dasselbe Lesemass brauchen: liefen sie getrennt, könnte der Seed eine Adresse
 * holen, die das Werkzeug als SSRF-Ziel abweist.
 */
import { isCloudShareUrl } from '@gruenerator/shared/utils';

import { crawlableUrls } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { crawlAndDistill } from '../../../services/search/index.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('namedPages');

/**
 * Snippet budget for a named page. A deliberate page read deserves far more
 * than a search hit's snippet.
 *
 * Was 25k, which was never actually reachable: `renderAll`'s shared shrink
 * collapses it as soon as a second source exists, and in unified mode there is
 * no `renderAll` at all, so the model saw whatever survived
 * `truncateResultForModel`. 8k of a DISTILLED page is text that arrives.
 */
export const CRAWL_SNIPPET_CHARS = 8_000;

/** Char budget handed to the distiller for a deliberately named page. */
const CRAWL_DISTILL_TARGET_CHARS = 8_000;

/** `scrape_url` nimmt höchstens drei Adressen je Aufruf. */
export const MAX_NAMED_PAGES = 3;

export interface NamedPagesRead {
  /** Adressen, die die SSRF-Prüfung bestanden haben. */
  validated: string[];
  /** Adressen, die die SSRF-Prüfung abgewiesen hat — mit Grund, damit ein
   *  Teilerfolg als solcher kenntlich bleibt. */
  rejected: { url: string; grund: string }[];
  results: SearchResult[];
}

/** Vergleichsform für „diese Adresse wurde gelesen": der Crawler darf Slash und Fragment ändern. */
export function normalisiereUrl(url: string): string {
  return url.trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
}

export async function readNamedPages(urls: string[]): Promise<NamedPagesRead> {
  const validated: string[] = [];
  const rejected: { url: string; grund: string }[] = [];
  for (const raw of urls) {
    const check = await validateUrlForFetch(raw);
    if (check.isValid && check.url) validated.push(check.url.toString());
    else {
      log.warn(`[scrape_url] rejected URL: ${check.error ?? 'invalid'}`);
      rejected.push({ url: raw, grund: check.error ?? 'ungültige oder nicht erlaubte Adresse' });
    }
  }
  if (validated.length === 0) return { validated, rejected, results: [] };
  const seeds = validated.map((url, idx) => ({
    url,
    title: url,
    content: '',
    relevance: 1 - idx * 0.1,
  }));
  // `faithful`, never query-focused: the page was NAMED, so a relevance
  // filter would drop precisely the parts the user asked about. The
  // distiller only condenses here, it does not select.
  const crawled = await crawlAndDistill(seeds, '', {
    maxUrls: MAX_NAMED_PAGES,
    timeout: 8000,
    mode: 'faithful',
    targetChars: CRAWL_DISTILL_TARGET_CHARS,
    condense: true,
  });
  const results: SearchResult[] = crawled
    .filter((r) => r.crawled && (r.content || r.fullContent))
    .map((r) => ({
      source: 'web',
      url: r.url,
      title: r.title || r.url || '',
      content: r.content || r.fullContent || '',
    }));
  return { validated, rejected, results };
}

/**
 * Die @link-Seiten, die der Loop vorab liest — dieselbe Auswahl, die der
 * Klassifikator für den Einzeldurchlauf trifft (`classifierNode`, „URL
 * context"): die Chips DIESES Turns; nur wenn es keine gibt und auch keine
 * Adresse im Text steht, die mitgeführten Seiten früherer Turns (#4888). Ein
 * Wolke-Freigabe-Link fällt heraus, er liefert beim Crawlen nur die SPA-Hülle
 * (`cloud_files` liest ihn). Eine getippte Adresse steht im Nachrichtentext,
 * den der Planer sieht — sie braucht keinen Seed.
 */
export function attachedPageUrls(state: ChatGraphState): string[] {
  if (state.enabledTools?.['scrape'] === false) return [];
  const attached = (state.attachedWebpageUrls ?? []).filter((url) => !isCloudShareUrl(url));
  if (attached.length > 0) return [...new Set(attached)].slice(0, MAX_NAMED_PAGES);
  if (crawlableUrls(state.lastUserTextNoMentions ?? '').length > 0) return [];
  const carried = (state.carriedWebpageUrls ?? []).filter((url) => !isCloudShareUrl(url));
  return [...new Set(carried)].slice(0, MAX_NAMED_PAGES);
}
