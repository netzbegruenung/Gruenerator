/**
 * Baut die Wegwerf-Sammlung eines Stemmer-Kandidaten aus einer Produktions-
 * sammlung — gleiche Punkt-IDs, gleiche Payload, gleicher DICHTER Vektor, nur
 * der BM25-Sparse-Vektor neu gerechnet (#3188).
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:bm25:build \
 *     --candidate snowball --collections kommunalwiki_documents
 *   pnpm --filter @gruenerator/api eval:retrieval:bm25:build --delete --yes
 *
 * DAS SPIEGELBILD VON `build-eval-embed-collection.ts`. Dort wird der dichte
 * Vektor neu gerechnet und der sparse mitkopiert; hier umgekehrt. Alles andere
 * reist unverändert mit, weil der Vergleich genau eine Variable misst und die
 * Fälle in `evals/retrieval/cases.ts` ihre Gold-Dokumente an `title` und
 * `source_url` aus der Payload erkennen.
 *
 * WARUM NICHT UNTER DER LEBENDEN SAMMLUNG GETAUSCHT WIRD. Stemmer, Stoppwörter
 * und Hash definieren zusammen das Index-Alphabet (Kopfkommentar von
 * `services/text/bm25.ts`). Eine Anfrage unter einem anderen Stemmer trifft
 * eine unveränderte Dokumentseite nicht — sie scheitert dabei aber nicht,
 * sondern liefert eine dünnere Trefferliste, die wie ein Qualitätsbefund
 * aussieht. Deshalb Kopie, und deshalb ist der Anfrage-Vektor im Eval-Lauf an
 * denselben Kandidaten gebunden (`runRetrievalEval.ts`).
 *
 * Kein Netzaufruf ausser Qdrant: der Stemmer ist reines Textverarbeiten, ein
 * Aufbau kostet nichts ausser Zeit. Der teure Teil des Einbettungs-Bake-offs
 * (`--limit` als Kostenbremse) hat hier deshalb keine Entsprechung nötig,
 * bleibt aber als Probelauf-Schalter erhalten.
 *
 * DIE LÖSCH-SCHRANKE steht in `evals/retrieval/bm25Candidates.ts`
 * (`guardDelete` / `deleteEvalCollections`) — dort, weil sie ohne Qdrant
 * prüfbar sein muss. Dieses Skript ruft nur.
 *
 * NOTE: dotenv muss vor jedem App-Import laufen (config/env.js parst die
 * Umgebung beim Import) — daher die dynamischen Importe unten.
 */
import dotenv from 'dotenv';

dotenv.config();

const { env } = await import('../config/env.js');
const { BM25_SPARSE_VECTOR_NAME } = await import('../config/qdrantCollectionsSchema.js');
const { getSystemQdrantCollections } = await import('../config/systemCollectionsConfig.js');
const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');
const {
  bm25CandidateSlugs,
  bm25CollectionName,
  deleteEvalCollections,
  encodeCandidateDocument,
  getBm25Candidate,
  guardDelete,
} = await import('../evals/retrieval/bm25Candidates.js');
const { createTargetCollection, expiresAtIso, planPages, pointText, resolveSourceCollections } =
  await import('../evals/retrieval/evalEmbedCollection.js');

import type { Bm25Candidate } from '../evals/retrieval/bm25Candidates.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Punkte je Scroll-Seite. Kleiner als die 256 des Einbettungs-Kopierers: hier
 * reist der DICHTE Vektor mit, eine Seite ist also um Grössenordnungen
 * schwerer.
 */
const SCROLL_PAGE = 64;

/** Punkte je Upsert. Dieselbe Zahl und derselbe Grund wie in
 *  `scripts/migrate-bm25-sparse.ts`: der Reverse-Proxy vor Qdrant hat bei mehr
 *  schon mit 413 geantwortet. */
const UPSERT_BATCH = 16;

interface CliArgs {
  candidate: string | null;
  collections: string[];
  limit: number | null;
  delete: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    candidate: null,
    collections: [],
    limit: null,
    delete: false,
    yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--candidate':
        args.candidate = argv[++i] ?? null;
        break;
      case '--collections':
        args.collections = (argv[++i] ?? '')
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        break;
      case '--limit': {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value < 1) {
          console.error('--limit must be a positive number');
          process.exit(1);
        }
        args.limit = Math.floor(value);
        break;
      }
      case '--delete':
        args.delete = true;
        break;
      case '--yes':
        args.yes = true;
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        process.exit(1);
    }
  }
  return args;
}

function usage(): never {
  console.error(
    'Usage:\n' +
      '  build-eval-bm25-collection.ts --candidate <slug> --collections a,b [--limit N]\n' +
      '  build-eval-bm25-collection.ts --delete --candidate <slug>   (drops that one)\n' +
      '  build-eval-bm25-collection.ts --delete --yes                (drops all of them)\n\n' +
      `Candidates: ${bm25CandidateSlugs().join(', ')}\n` +
      `Collections: ${[...new Set(getSystemQdrantCollections())].join(', ')}`
  );
  process.exit(1);
}

function validateBuildArgs(args: CliArgs): { candidate: Bm25Candidate; sources: string[] } {
  if (!args.candidate || args.collections.length === 0) usage();
  const candidate = getBm25Candidate(args.candidate);
  if (!candidate) {
    console.error(
      `Unknown candidate "${args.candidate}". Known: ${bm25CandidateSlugs().join(', ')}`
    );
    process.exit(1);
  }
  try {
    return { candidate, sources: resolveSourceCollections(args.collections) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function collectionExists(client: QdrantClient, name: string): Promise<boolean> {
  const { collections } = await client.getCollections();
  return collections.some((c) => c.name === name);
}

/**
 * Die Dimension der Quelle. Sie wird gelesen und nicht geraten, weil die
 * Wegwerf-Sammlung den dichten Vektor 1:1 übernimmt — eine falsche Dimension
 * liesse Qdrant erst beim Upsert scheitern, mit halb gefüllter Sammlung.
 */
async function denseDims(client: QdrantClient, collection: string): Promise<number> {
  const info = await client.getCollection(collection);
  const vectors = info.config.params.vectors as
    { size?: number } | Record<string, { size?: number }>;
  const params = typeof vectors?.size === 'number' ? vectors : (vectors as never)[''];
  const size = (params as { size?: number } | undefined)?.size;
  if (typeof size !== 'number') {
    throw new Error(`Cannot determine dense vector params for ${collection}`);
  }
  return size;
}

/** Nur Punkte, deren Sparse-Vektor auch Begriffe hat — ein leerer wäre in
 *  Qdrant kein Fehler, aber im Vergleich ein stiller Ausfall. */
function sparseFor(text: string, candidate: Bm25Candidate) {
  const sparse = encodeCandidateDocument(text, candidate);
  return sparse.indices.length > 0 ? sparse : null;
}

async function buildOne(
  client: QdrantClient,
  candidate: Bm25Candidate,
  source: string,
  limit: number | null
): Promise<void> {
  const target = bm25CollectionName(candidate.slug, source);
  console.log(`\n── ${source} → ${target} (stemmer: ${candidate.slug}) ──`);

  if (!(await collectionExists(client, source))) {
    throw new Error(`source collection "${source}" does not exist`);
  }

  // Ein halb gefüllter Aufbau aus einem abgebrochenen Lauf sähe wie eine
  // vollständige Messung aus. Neu bauen ist die einzige Variante, die nicht
  // still das Falsche misst.
  if (await collectionExists(client, target)) {
    await deleteEvalCollections([target], (name) => client.deleteCollection(name));
    console.log(`  dropped the previous ${target}`);
  }

  const dims = await denseDims(client, source);
  await createTargetCollection(
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createCollection: (name, config) => client.createCollection(name, config as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createPayloadIndex: (name, params) => client.createPayloadIndex(name, params as any),
    },
    target,
    source,
    dims,
    true
  );

  const pages = planPages(limit, SCROLL_PAGE);
  const expiresAt = expiresAtIso();
  let offset: string | number | undefined | null = undefined;
  let pageIndex = 0;
  let copied = 0;
  let skipped = 0;

  for (;;) {
    const pageSize = pages === null ? SCROLL_PAGE : pages[pageIndex];
    if (pageSize === undefined) break;
    pageIndex += 1;

    const page = await client.scroll(source, {
      limit: pageSize,
      with_payload: true,
      with_vector: true,
      ...(offset != null && { offset }),
    });

    const points: Array<{
      id: string | number;
      vector: Record<string, unknown>;
      payload: Record<string, unknown>;
    }> = [];
    for (const point of page.points) {
      const payload = (point.payload as Record<string, unknown> | null) ?? {};
      const text = pointText(payload);
      const sparse = text === null ? null : sparseFor(text, candidate);
      if (sparse === null) {
        skipped += 1;
        continue;
      }
      const dense = Array.isArray(point.vector)
        ? point.vector
        : (point.vector as Record<string, unknown> | null)?.[''];
      if (!Array.isArray(dense)) {
        skipped += 1;
        continue;
      }
      points.push({
        id: point.id,
        vector: { '': dense, [BM25_SPARSE_VECTOR_NAME]: sparse },
        payload: { ...payload, eval_expires_at: expiresAt },
      });
    }

    for (let i = 0; i < points.length; i += UPSERT_BATCH) {
      await client.upsert(target, {
        wait: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        points: points.slice(i, i + UPSERT_BATCH) as any,
      });
    }
    copied += points.length;
    if (points.length > 0) console.log(`  ${copied} points re-encoded and upserted`);

    offset = page.next_page_offset as string | number | null;
    if (offset == null) break;
  }

  const finalCount = (await client.count(target, { exact: true })).count;
  console.log(`  done: ${copied} points copied, ${skipped} skipped, ${finalCount} in ${target}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = args.delete ? null : validateBuildArgs(args);

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  if (args.delete) {
    if (!args.candidate && !args.yes) {
      console.error(
        '--delete drops every eval_bm25_* collection. Add --yes, or --candidate <slug>.'
      );
      process.exit(1);
    }
    const names = (await client.getCollections()).collections.map((c) => c.name);
    const doomed = guardDelete(names, args.candidate);
    if (doomed.length === 0) {
      console.log('nothing to delete');
      return;
    }
    await deleteEvalCollections(names, (name) => client.deleteCollection(name), args.candidate);
    console.log(`deleted: ${doomed.join(', ')}`);
    return;
  }

  for (const source of plan!.sources) {
    await buildOne(client, plan!.candidate, source, args.limit);
  }
}

await main();
