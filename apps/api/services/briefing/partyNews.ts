/**
 * Die neuesten Artikel der Bundespartei für das Tagesbriefing: gruene.de für
 * Deutschland, gruene.at für Österreich — für alle, nicht rollengebunden.
 *
 * Gelesen wird der Qdrant-Korpus der Scraper (ein Punkt je Artikel:
 * `chunk_index = 0`), gefiltert auf die News-Art und einen Datumsbereich auf
 * `published_at`. Ein Bereichsfilter statt `order_by`, weil `published_at`
 * nicht in jeder Sammlung als `datetime` indiziert ist (#3190); sortiert wird
 * danach im Code. 15 Minuten Redis-Cache je Locale — der Login-Pfad zahlt also
 * höchstens alle 15 Minuten einen Scroll.
 */
import { z } from 'zod';

import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { berlinDay, shiftDay } from './time.js';

import type { BriefingLocale, LvNewsItem } from './types.js';

const log = createLogger('briefing:partyNews');

const CACHE_TTL_SECONDS = 15 * 60;
const SCROLL_LIMIT = 200;

/** Die News-Quelle je Land: Sammlung, `content_type` der Artikel, Anzeigename. */
export const PARTY_NEWS_SOURCES: Record<
  BriefingLocale,
  { collection: string; contentType: string; sourceName: string }
> = {
  'de-DE': { collection: 'gruene_de_documents', contentType: 'artikel', sourceName: 'gruene.de' },
  'de-AT': { collection: 'gruene_at_documents', contentType: 'news', sourceName: 'gruene.at' },
};

const itemsSchema = z.array(
  z.object({ title: z.string(), url: z.string(), sourceName: z.string(), day: z.string() })
);

function cacheKey(locale: BriefingLocale, days: number): string {
  return `briefing:party-news:v1:${locale}:${days}`;
}

/** Ein Qdrant-Payload als Nachricht, oder null, wenn Titel, URL oder Datum fehlen. */
export function toPartyNewsItem(
  payload: Record<string, unknown>,
  sourceName: string
): LvNewsItem | null {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const url = typeof payload.source_url === 'string' ? payload.source_url : '';
  const published = typeof payload.published_at === 'string' ? payload.published_at : '';
  const day = /^\d{4}-\d{2}-\d{2}/.exec(published)?.[0];
  if (!title || !url || !day) return null;
  return { title, url, sourceName, day };
}

/** Die neuesten Parteiartikel der letzten `days` Tage, neueste zuerst. Wirft nicht. */
export async function getRecentPartyNews(
  locale: BriefingLocale,
  days: number,
  limit: number
): Promise<LvNewsItem[]> {
  const cached = await getCachedJson(cacheKey(locale, days), itemsSchema);
  if (cached) return cached.slice(0, limit);

  const source = PARTY_NEWS_SOURCES[locale];
  const today = berlinDay(new Date());
  const cutoff = shiftDay(today, -(days - 1));
  try {
    const qdrant = getQdrantInstance();
    await qdrant.init();
    if (!qdrant.isContentAvailable()) return [];
    const client = qdrant.readClient(source.collection);
    const result = await client.scroll(source.collection, {
      filter: {
        must: [
          { key: 'chunk_index', match: { value: 0 } },
          { key: 'content_type', match: { value: source.contentType } },
          { key: 'published_at', range: { gte: cutoff } },
        ],
      },
      limit: SCROLL_LIMIT,
      with_payload: ['title', 'source_url', 'published_at'],
      with_vector: false,
    });
    const seen = new Set<string>();
    const items = (result.points ?? [])
      .map((p) => toPartyNewsItem((p.payload as Record<string, unknown>) ?? {}, source.sourceName))
      .filter((item): item is LvNewsItem => item !== null && item.day <= today)
      .sort((a, b) => b.day.localeCompare(a.day))
      .filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)));
    await setCachedJson(cacheKey(locale, days), items, CACHE_TTL_SECONDS);
    return items.slice(0, limit);
  } catch (error) {
    log.warn(`party news ${locale} unavailable: ${(error as Error).message}`);
    return [];
  }
}
