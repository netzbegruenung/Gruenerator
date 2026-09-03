/**
 * ANN-vs-exact recall check (qdrant-search-quality diagnosis pattern):
 * runs every eval query twice against Qdrant — approximate HNSW and
 * exact=true — and reports the overlap as recall@k. Separates "the HNSW
 * index misses points" (tune ef/m) from "the embedding/pipeline is wrong"
 * (which the main eval measures). Target: >95% recall@k.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:ann
 *
 * Filtered arm (#3189): every unfiltered case above queries a collection with
 * no payload filter — the segment layout `documents` actually serves under
 * (18 live segments as of 2026-09-03, see qdrantCollectionsSchema.ts) is a
 * FILTERED query, because every real notebook search narrows `documents` to
 * its own document set. HNSW's filtered search degrades differently than
 * unfiltered — more segments means more per-segment graphs to walk when most
 * of each graph gets excluded by the filter. The `notebook.user.documentIds`
 * cases in `cases.ts` are the only `kind: 'notebook'` cases that actually
 * route through `documents` (system-collection notebook cases, incl. the
 * `collectionIds` multi-collection ones, resolve to their own system
 * collections instead — see `getSystemCollectionConfig`). Their filter shape
 * is copied from `NotebookQAService`'s user-collection path
 * (`_getSingleCollectionSearchContext` → `_performSearch` with `documentIds`),
 * which DocumentSearchService/searchOperations.ts turns into
 * `{ key: 'document_id', match: { any: documentIds } }` — NOT `collection_id`.
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules (static imports would be hoisted above it).
dotenv.config();

const { env } = await import('../../config/env.js');
const { getSystemCollectionConfig } = await import('../../config/systemCollectionsConfig.js');
const { createQdrantClient } = await import('../../database/services/QdrantService/connection.js');
const { mistralEmbeddingService } = await import('../../services/mistral/index.js');
const { RETRIEVAL_CASES } = await import('./cases.js');
const { recallAtK } = await import('./recallAtK.js');

const K = 10;
const DOCUMENTS_COLLECTION = 'documents';

function recordStats(
  perCollection: Map<string, { overlap: number; total: number }>,
  key: string,
  result: { overlap: number; total: number }
): void {
  const stats = perCollection.get(key) ?? { overlap: 0, total: 0 };
  stats.overlap += result.overlap;
  stats.total += result.total;
  perCollection.set(key, stats);
}

async function main() {
  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });
  await mistralEmbeddingService.init();

  const perCollection = new Map<string, { overlap: number; total: number }>();

  for (const evalCase of RETRIEVAL_CASES) {
    const config = getSystemCollectionConfig(evalCase.collection);
    if (!config) continue;

    const vector = await mistralEmbeddingService.generateEmbedding(evalCase.query);
    const [approx, exact] = await Promise.all([
      client.query(config.qdrantCollection, { query: vector, limit: K, with_payload: false }),
      client.query(config.qdrantCollection, {
        query: vector,
        limit: K,
        with_payload: false,
        params: { exact: true },
      }),
    ]);

    recordStats(
      perCollection,
      config.qdrantCollection,
      recallAtK(
        approx.points.map((p) => String(p.id)),
        exact.points.map((p) => String(p.id))
      )
    );
  }

  // Filtered arm on `documents` (#3189) — see module docblock.
  const notebookDocumentCases = RETRIEVAL_CASES.filter(
    (c) =>
      c.kind === 'notebook' &&
      c.notebook?.user?.documentIds !== undefined &&
      c.notebook.user.documentIds.length > 0
  );

  if (notebookDocumentCases.length > 0) {
    const collectionInfo = await client.getCollection(DOCUMENTS_COLLECTION);
    console.log(
      `${DOCUMENTS_COLLECTION}: segments_count=${collectionInfo.segments_count ?? 'unknown'} ` +
        `indexed_vectors_count=${collectionInfo.indexed_vectors_count ?? 'unknown'}\n`
    );

    const filteredKey = `${DOCUMENTS_COLLECTION} (filtered, notebook)`;
    const unfilteredKey = `${DOCUMENTS_COLLECTION} (unfiltered, notebook)`;

    for (const evalCase of notebookDocumentCases) {
      const documentIds = evalCase.notebook!.user!.documentIds;
      const filter = {
        must: [{ key: 'document_id', match: { any: documentIds } }],
      };
      const vector = await mistralEmbeddingService.generateEmbedding(evalCase.query);

      const [approxFiltered, exactFiltered, approxUnfiltered, exactUnfiltered] = await Promise.all([
        client.query(DOCUMENTS_COLLECTION, {
          query: vector,
          limit: K,
          with_payload: false,
          filter,
        }),
        client.query(DOCUMENTS_COLLECTION, {
          query: vector,
          limit: K,
          with_payload: false,
          filter,
          params: { exact: true },
        }),
        client.query(DOCUMENTS_COLLECTION, { query: vector, limit: K, with_payload: false }),
        client.query(DOCUMENTS_COLLECTION, {
          query: vector,
          limit: K,
          with_payload: false,
          params: { exact: true },
        }),
      ]);

      recordStats(
        perCollection,
        filteredKey,
        recallAtK(
          approxFiltered.points.map((p) => String(p.id)),
          exactFiltered.points.map((p) => String(p.id))
        )
      );
      recordStats(
        perCollection,
        unfilteredKey,
        recallAtK(
          approxUnfiltered.points.map((p) => String(p.id)),
          exactUnfiltered.points.map((p) => String(p.id))
        )
      );
    }
  }

  console.log(`── ANN recall@${K} (approximate vs exact) ──`);
  let sumOverlap = 0;
  let sumTotal = 0;
  for (const [collection, { overlap, total }] of perCollection) {
    sumOverlap += overlap;
    sumTotal += total;
    console.log(`${collection.padEnd(32)} ${((100 * overlap) / Math.max(1, total)).toFixed(1)}%`);
  }
  const overallPct = (100 * sumOverlap) / Math.max(1, sumTotal);
  console.log(`${'GESAMT'.padEnd(32)} ${overallPct.toFixed(1)}%`);
  if (overallPct < 95) {
    console.log('\nUnter 95% — HNSW-Tuning prüfen (hnsw_ef erhöhen, ggf. ef_construct/m).');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('ANN recall check failed:', error);
  process.exit(1);
});
