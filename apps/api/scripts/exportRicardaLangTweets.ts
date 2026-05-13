/**
 * Phase 3 Step A: dump all Ricarda Lang tweets from the `ricarda_lang_tweets`
 * Qdrant collection into a single JSONL file for offline style analysis.
 *
 * Usage: pnpm --filter @gruenerator/api exec tsx scripts/exportRicardaLangTweets.ts
 *
 * Output: apps/api/data/ricarda-lang-tweets.jsonl
 *   Each line: { tweet_id, content, published_at, lang, url }
 *   Sorted newest-first by `published_at`.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import * as dotenv from 'dotenv';

dotenv.config();

const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');

interface TweetRecord {
  tweet_id: string;
  content: string;
  published_at: string | null;
  lang: string | null;
  url: string;
}

const COLLECTION = 'ricarda_lang_tweets';
const OUTPUT = 'data/ricarda-lang-tweets.jsonl';
const SCROLL_BATCH = 100;

async function main(): Promise<void> {
  const qdrant = getQdrantInstance();
  await qdrant.ensureConnected();
  const client = qdrant.client;
  if (!client) throw new Error('Qdrant client unavailable');

  const tweets: TweetRecord[] = [];
  let offset: string | number | null = null;
  let pages = 0;

  do {
    const result = await client.scroll(COLLECTION, {
      limit: SCROLL_BATCH,
      ...(offset != null && { offset }),
      with_payload: ['tweet_id', 'content', 'published_at', 'lang', 'example_id'],
      with_vector: false,
    });
    pages++;

    for (const point of result.points ?? []) {
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      const tweet_id = String(payload.tweet_id ?? '');
      const content = String(payload.content ?? '');
      if (!tweet_id || !content) continue;
      tweets.push({
        tweet_id,
        content,
        published_at: (payload.published_at as string | null | undefined) ?? null,
        lang: (payload.lang as string | null | undefined) ?? null,
        url: String(payload.example_id ?? `https://x.com/Ricarda_Lang/status/${tweet_id}`),
      });
    }

    const next = result.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : null;
    console.log(
      `[export] page ${pages}: ${result.points?.length ?? 0} points → ${tweets.length} total`
    );
  } while (offset != null);

  tweets.sort((a, b) => {
    const at = a.published_at ?? '';
    const bt = b.published_at ?? '';
    return bt.localeCompare(at);
  });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, tweets.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8');
  console.log(`[export] wrote ${tweets.length} tweets to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('[export] failed', err);
  process.exit(1);
});
