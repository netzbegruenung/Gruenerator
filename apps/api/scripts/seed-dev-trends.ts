/**
 * Beispiel-Trends für den lokalen Monitor — NUR lokal, für den Arbeiten-Tab und /wissen.
 *
 * Lokal fehlen im Monitor-Snapshot meist Keywords (kein NLP-Dienst) und X-Trends
 * (kein Scraper), oft gibt es gar keinen Snapshot. Das Skript lädt den echten je
 * Locale (sonst einen leeren), ergänzt nur die leeren Felder und legt ihn in den
 * Redis-Cache. Der nächste Monitor-Refresh
 * löscht den Cache und damit die Beispiele.
 *
 *   cd apps/api
 *   npx tsx scripts/seed-dev-trends.ts
 */
import 'dotenv/config';

import {
  type MonitorKeywordEntry,
  type MonitorSnapshot,
  type SocialTrend,
} from '@gruenerator/contracts';

import { getPostgresInstance } from '../database/services/PostgresService.js';
import { getLatestSnapshot, snapshotCacheKey } from '../services/monitor/MonitorService.js';
import { MONITOR_LOCALES, type MonitorLocale } from '../services/monitor/types.js';
import { setCachedJson } from '../utils/redis/jsonCache.js';

const TTL_SECONDS = 7 * 24 * 60 * 60;

const KEYWORDS: Record<MonitorLocale, Array<[string, number]>> = {
  de: [
    ['Klimageld', 48],
    ['Deutschlandticket', 37],
    ['Mietpreisbremse', 29],
    ['Wärmepumpe', 21],
    ['Kommunalfinanzen', 17],
  ],
  at: [
    ['Klimaticket', 41],
    ['Bodenversiegelung', 33],
    ['Teuerung', 26],
    ['Pflegereform', 19],
    ['Bildungsreform', 14],
  ],
};

const SOCIAL_TRENDS: Record<MonitorLocale, string[]> = {
  de: [
    '#Bundestag',
    'Haushalt 2027',
    '#Klimaschutz',
    'Bahnstreik',
    '#Mietendeckel',
    'Energiepreise',
  ],
  at: ['#Nationalrat', 'Klimaticket', '#ORF', 'Teuerung', '#Bildung', 'Hitzeschutz'],
};

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres', 'redis'];

function guard(): void {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed: NODE_ENV=production');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  if (!LOCAL_HOSTS.includes(host))
    throw new Error(`Refusing to seed: POSTGRES_HOST=${host} is not local`);
  // The only write goes to Redis, so its host must be local too.
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('Refusing to seed: REDIS_URL is not set');
  const redisHost = new URL(redisUrl).hostname.replace(/^\[|\]$/g, '');
  if (!LOCAL_HOSTS.includes(redisHost))
    throw new Error(`Refusing to seed: REDIS_URL host ${redisHost} is not local`);
}

async function main(): Promise<void> {
  guard();
  await getPostgresInstance().init();

  for (const locale of MONITOR_LOCALES) {
    // Without a local monitor run there is no snapshot at all: start from an empty one.
    const snapshot: MonitorSnapshot = (await getLatestSnapshot(locale)) ?? {
      id: `dev-seed-${locale}`,
      createdAt: new Date().toISOString(),
      topics: [],
      keywords: [],
      socialTrends: [],
      totalArticles: 0,
      sources: [],
      articlesByLocale: { de: 0, at: 0 },
    };
    const keywords: MonitorKeywordEntry[] =
      snapshot.keywords.length > 0
        ? snapshot.keywords
        : KEYWORDS[locale].map(([keyword, count]) => ({ keyword, count, topic: null }));
    const socialTrends: SocialTrend[] =
      snapshot.socialTrends.length > 0
        ? snapshot.socialTrends
        : SOCIAL_TRENDS[locale].map((name, i) => ({
            rank: i + 1,
            name,
            url: `https://x.com/search?q=${encodeURIComponent(name)}`,
          }));
    await setCachedJson(
      snapshotCacheKey(locale),
      { ...snapshot, keywords, socialTrends },
      TTL_SECONDS
    );
    console.log(`[${locale}] ${keywords.length} keywords, ${socialTrends.length} X trends cached`);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
