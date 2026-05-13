/**
 * Phase 1 seed: inserts a handful of synthetic Ricarda Lang tweet documents
 * into the `ricarda_lang_tweets` Qdrant collection so the
 * `gruenerator-ricarda-lang` specialized agent can be smoke-tested end-to-end
 * without depending on the X API.
 *
 * Usage: npx tsx apps/api/scripts/seedRicardaLangTweets.ts
 *
 * Prerequisites: backend has booted at least once so QdrantService.init()
 * created the `ricarda_lang_tweets` collection (registered in
 * qdrantCollectionsSchema.ts).
 */
import * as dotenv from 'dotenv';

dotenv.config();

const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');
const { indexSocialMediaExample } = await import('../database/services/QdrantService/indexing.js');
const { mistralEmbeddingService } = await import('../services/mistral/index.js');

interface SyntheticTweet {
  id: string;
  text: string;
  publishedAt: string;
}

const TWEETS: SyntheticTweet[] = [
  {
    id: '1700000000000000001',
    text: 'Klimaschutz ist die soziale Frage unserer Zeit. Wer jetzt nicht investiert, zahlt morgen drauf — besonders die Menschen mit kleinen Einkommen.',
    publishedAt: '2025-09-12T10:14:00Z',
  },
  {
    id: '1700000000000000002',
    text: 'Die Kindergrundsicherung ist eine Frage des Anstands. Kein Kind in einem reichen Land darf in Armut aufwachsen.',
    publishedAt: '2025-10-03T08:22:00Z',
  },
  {
    id: '1700000000000000003',
    text: 'Die Schuldenbremse in ihrer jetzigen Form ist eine Investitionsbremse. Wir brauchen Spielraum für Bildung, Bahn und Klimaschutz.',
    publishedAt: '2025-11-21T17:48:00Z',
  },
  {
    id: '1700000000000000004',
    text: 'Tempo 30 in Innenstädten rettet Leben und macht Städte lebenswerter. Kommunen müssen selbst entscheiden dürfen.',
    publishedAt: '2026-01-08T13:05:00Z',
  },
  {
    id: '1700000000000000005',
    text: 'Wärmewende heißt: faire Förderung statt Verbote-Debatten. Niemand wird im Stich gelassen.',
    publishedAt: '2026-02-19T09:30:00Z',
  },
];

const HANDLE = 'Ricarda_Lang';
const COLLECTION = 'ricarda_lang_tweets';

async function main(): Promise<void> {
  await mistralEmbeddingService.init();
  if (!mistralEmbeddingService.isReady()) {
    throw new Error('Mistral embedding service did not initialize');
  }

  const qdrant = getQdrantInstance();
  await qdrant.ensureConnected();
  const client = qdrant.client;
  if (!client) throw new Error('Qdrant client unavailable');

  let inserted = 0;
  for (const tweet of TWEETS) {
    const exampleId = `https://x.com/${HANDLE}/status/${tweet.id}`;
    const embedding = await mistralEmbeddingService.generateEmbedding(tweet.text);
    await indexSocialMediaExample(client, COLLECTION, exampleId, embedding, tweet.text, 'x', {
      country: 'DE',
      source_account: HANDLE,
      tweet_id: tweet.id,
      published_at: tweet.publishedAt,
      lang: 'de',
    });
    inserted++;
    console.log(`[seed] indexed ${exampleId}`);
  }

  console.log(`[seed] done — ${inserted} synthetic tweets in ${COLLECTION}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
