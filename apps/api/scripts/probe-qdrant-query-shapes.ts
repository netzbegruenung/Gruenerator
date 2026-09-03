/**
 * Fähigkeitsprobe für die Tuning-Arme aus #3118: nimmt der LAUFENDE Qdrant die
 * Abfragegestalten an, die der Client 1.19 typisiert? `rrf: { weights }`
 * (generated_schema.d.ts:3642-3654) und verschachtelte Prefetches (:3537)
 * stehen in den Client-Typen; der Server ist eine andere Frage.
 *
 * Reiner Lesezugriff, `limit: 1` je Gestalt. Keine Migration, kein Schreiben.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/probe-qdrant-query-shapes.ts
 *
 * Ein `400` beantwortet in Sekunden, was sonst eine 52-Fall-Runde kostet.
 * Fällt eine Gestalt aus, gehört der Arm als „vom Server abgelehnt" in die
 * Messtabelle — nicht weggelassen.
 *
 * Seit #3166 ist die letzte Gestalt ein `queryBatch` mit drei Suchen: die
 * Fusionsabfrage plus die beiden Vorabholungen als eigenständige Suchen, aus
 * denen der Score-Join den dichten Kosinus und den BM25-Wert zieht. Geprüft
 * wird zweierlei — nimmt der Server den Batch überhaupt an, und kostet er
 * gegenüber demselben `query` allein spürbar Zeit (beide Läufe werden hier
 * gestoppt, damit die Latenzfrage aus R5 nicht erst in der Messreihe auffällt).
 */
import 'dotenv/config';

import { BM25_SPARSE_VECTOR_NAME } from '../config/qdrantCollectionsSchema.js';
import {
  getQdrantInstance,
  useQdrantConnectOnly,
} from '../database/services/QdrantService/index.js';
import { encodeBm25Query } from '../services/text/index.js';

import type { Schemas } from '@qdrant/js-client-rest';

const COLLECTION = 'kommunalwiki_documents';
const QUERY = 'Klimaschutz Bebauungsplan';

async function shape(
  name: string,
  body: Schemas['QueryRequest'],
  client: {
    query: (collection: string, body: Schemas['QueryRequest']) => Promise<{ points: unknown[] }>;
  }
): Promise<void> {
  try {
    const result = await client.query(COLLECTION, body);
    console.log(`✓ ${name}: akzeptiert, ${result.points.length} Punkt(e)`);
  } catch (err) {
    const e = err as { message?: string; status?: number; data?: unknown };
    console.log(`✗ ${name}: ${e.message ?? String(err)}`);
    if (e.status) console.log(`    status: ${e.status}`);
    if (e.data) console.log(`    data:   ${JSON.stringify(e.data).slice(0, 400)}`);
  }
}

/**
 * Dieselben Vorabholungen wie `rrf`, aber als Batch: Eintrag 1 ist die Fusion,
 * Eintrag 2 und 3 spiegeln die Vorabholungen mit `with_payload: false`. Genau
 * diese Gestalt baut `hybridSearchServerSide` mit HYBRID_SERVER_SCORE_JOIN=true.
 */
async function batchShape(
  name: string,
  searches: Schemas['QueryRequest'][],
  client: {
    queryBatch: (
      collection: string,
      body: { searches: Schemas['QueryRequest'][] }
    ) => Promise<Array<{ points: unknown[] }>>;
  }
): Promise<void> {
  const started = Date.now();
  try {
    const responses = await client.queryBatch(COLLECTION, { searches });
    const counts = responses.map((r) => r.points.length).join('/');
    console.log(
      `✓ ${name}: akzeptiert, ${responses.length} Antwort(en), Punkte ${counts}, ${Date.now() - started} ms`
    );
  } catch (err) {
    const e = err as { message?: string; status?: number; data?: unknown };
    console.log(`✗ ${name}: ${e.message ?? String(err)} (${Date.now() - started} ms)`);
    if (e.status) console.log(`    status: ${e.status}`);
    if (e.data) console.log(`    data:   ${JSON.stringify(e.data).slice(0, 400)}`);
  }
}

async function main(): Promise<void> {
  useQdrantConnectOnly();
  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client;
  if (!client) throw new Error('Qdrant client not initialised — check QDRANT_URL');

  const info = await client.getCollection(COLLECTION);
  const vectors = (info.config?.params as { vectors?: { size?: number } } | undefined)?.vectors;
  const size = vectors?.size;
  if (typeof size !== 'number') {
    throw new Error(`Could not read the dense vector size of ${COLLECTION}`);
  }
  console.log(`${COLLECTION}: dense dim ${size}`);

  // Synthetischer, aber nicht-nullwertiger Vektor: geprüft wird die GESTALT,
  // nicht die Trefferqualität. Ein Nullvektor kann auf einer Kosinus-Sammlung
  // selbst einen 400 auslösen und würde das Ergebnis mehrdeutig machen.
  const dense = Array.from({ length: size }, (_, i) => ((i % 7) + 1) / 10);
  const sparse = encodeBm25Query(QUERY);
  if (sparse.indices.length === 0)
    throw new Error('BM25 encoder produced no terms for the probe query');

  const densePrefetch: Schemas['Prefetch'] = { query: dense, using: '', limit: 4 };
  const sparsePrefetch: Schemas['Prefetch'] = {
    query: { indices: sparse.indices, values: sparse.values },
    using: BM25_SPARSE_VECTOR_NAME,
    limit: 4,
  };

  await shape(
    'rrf (ausgeliefert)',
    { prefetch: [densePrefetch, sparsePrefetch], query: { fusion: 'rrf' }, limit: 1 },
    client
  );
  await shape(
    'rrf mit einer einzigen Vorabholung (Sparse-Faktor 0, dicht-nur-Kontrollarm)',
    { prefetch: [densePrefetch], query: { fusion: 'rrf' }, limit: 1 },
    client
  );
  await shape(
    'dbsf',
    { prefetch: [densePrefetch, sparsePrefetch], query: { fusion: 'dbsf' }, limit: 1 },
    client
  );
  await shape(
    'rrf_weighted',
    {
      prefetch: [densePrefetch, sparsePrefetch],
      query: { rrf: { weights: [0.7, 0.3] } },
      limit: 1,
    },
    client
  );
  await shape(
    'dense_rescore (verschachtelt)',
    {
      prefetch: [{ prefetch: [densePrefetch, sparsePrefetch], query: { fusion: 'rrf' }, limit: 4 }],
      query: dense,
      using: '',
      limit: 1,
    },
    client
  );
  await shape(
    'sparse_only',
    {
      query: { indices: sparse.indices, values: sparse.values },
      using: BM25_SPARSE_VECTOR_NAME,
      limit: 1,
    },
    client
  );

  // Vergleichsmessung: dieselbe Fusionsabfrage einmal allein, einmal als
  // erster Eintrag eines Batch mit den beiden Spiegelsuchen. Die Differenz der
  // beiden Zeiten ist die Zahl, die R5 in der Messreihe erwartet — hier
  // vorweg, mit einer Anfrage statt mit 52.
  const fusionRequest: Schemas['QueryRequest'] = {
    prefetch: [densePrefetch, sparsePrefetch],
    query: { fusion: 'rrf' },
    limit: 4,
    with_payload: true,
  };

  const solo = Date.now();
  await client.query(COLLECTION, fusionRequest);
  console.log(`  Referenz: dieselbe rrf-Abfrage einzeln, ${Date.now() - solo} ms`);

  await batchShape(
    'queryBatch: rrf + dichte Spiegelsuche + sparse Spiegelsuche (#3166)',
    [
      fusionRequest,
      { ...densePrefetch, with_payload: false },
      { ...sparsePrefetch, with_payload: false },
    ],
    client
  );

  process.exit(0);
}

main().catch((error) => {
  console.error('Probe failed:', error);
  process.exit(1);
});
