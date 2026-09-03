/**
 * Baut die Wegwerf-Sammlung eines Bake-off-Kandidaten aus einer Produktions-
 * sammlung — gleiche Punkt-IDs, gleiche Payload, gleicher Sparse-Vektor, nur
 * der dichte Vektor neu gerechnet.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:embed:build -- \
 *     --candidate bge-m3 --collections grundsatz_documents,kommunalwiki_documents
 *   pnpm --filter @gruenerator/api eval:retrieval:embed:build -- --delete
 *
 * WARUM ALLES ANDERE 1:1 KOPIERT WIRD. Der Bake-off misst genau eine Variable.
 * Ein neu berechneter Sparse-Vektor, eine andere Payload oder eine andere
 * Punkt-ID würden mitgemessen, ohne im Ergebnis unterscheidbar zu sein — und
 * die Fälle in `evals/retrieval/cases.ts` erkennen ihre Gold-Dokumente an
 * `title`/`source_url` aus der Payload, die also Zeichen für Zeichen dieselbe
 * sein muss.
 *
 * DER SPARSE-VEKTOR REIST MIT, DER DICHTE NICHT. Gescrollt wird mit
 * `with_vector: ['bm25']` statt `true`: der dichte Vektor der Quelle wird
 * ohnehin verworfen, der Sparse dagegen ist auf `kommunalwiki_documents` der
 * Grund, warum der Join-Pfad dort überhaupt vergleichbar bleibt. Führt die
 * Quelle keinen, wird gar kein Vektor angefordert.
 *
 * DIE LÖSCH-SCHRANKE steht in `evals/retrieval/evalEmbedCollection.ts`
 * (`guardDelete` / `deleteEvalCollections`) — dort, weil sie ohne Qdrant
 * prüfbar sein muss. Dieses Skript ruft nur.
 *
 * NOTE: dotenv muss vor jedem App-Import laufen (config/env.js parst die
 * Umgebung beim Import) — daher die dynamischen Importe unten.
 */
import dotenv from 'dotenv';

dotenv.config();

const { env } = await import('../config/env.js');
const { BM25_SPARSE_VECTOR_NAME, COLLECTION_SCHEMAS, getCollectionConfig, INDEX_TYPES } =
  await import('../config/qdrantCollectionsSchema.js');
const { getSystemCollectionConfig, getSystemQdrantCollections } =
  await import('../config/systemCollectionsConfig.js');
const { createQdrantClient } = await import('../database/services/QdrantService/connection.js');
const { createCandidateEmbedder, createProviderBatchEmbedder } =
  await import('../evals/retrieval/candidateEmbedder.js');
const { embedCandidateSlugs, evalCollectionName, getEmbedCandidate } =
  await import('../evals/retrieval/embedCandidates.js');
const {
  deleteEvalCollections,
  expiresAtIso,
  planPages,
  pointText,
  SCROLL_PAGE,
  toEvalPoint,
  UPSERT_BATCH,
} = await import('../evals/retrieval/evalEmbedCollection.js');

import type { EmbedCandidate } from '../evals/retrieval/embedCandidates.js';
import type { SourcePoint } from '../evals/retrieval/evalEmbedCollection.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

interface CliArgs {
  candidate: string | null;
  collections: string[];
  limit: number | null;
  delete: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { candidate: null, collections: [], limit: null, delete: false };
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
      '  build-eval-embed-collection.ts --candidate <slug> --collections a,b [--limit N]\n' +
      '  build-eval-embed-collection.ts --delete\n\n' +
      `Candidates: ${embedCandidateSlugs().join(', ')}\n` +
      `Collections: ${[...new Set(getSystemQdrantCollections())].join(', ')}`
  );
  process.exit(1);
}

/** Der Kandidat eines Bau-Laufs, oder Abbruch mit einer brauchbaren Meldung. */
function validateBuildArgs(args: CliArgs): EmbedCandidate {
  if (!args.candidate || args.collections.length === 0) usage();
  const candidate = getEmbedCandidate(args.candidate);
  if (!candidate) {
    console.error(
      `Unknown candidate "${args.candidate}". Known: ${embedCandidateSlugs().join(', ')}`
    );
    process.exit(1);
  }
  return candidate;
}

/** Nimmt eine System-Kennung (`grundsatz-system`) ODER den physischen Namen. */
function resolveSourceCollection(name: string): string {
  return getSystemCollectionConfig(name)?.qdrantCollection ?? name;
}

async function hasSparseVector(client: QdrantClient, collection: string): Promise<boolean> {
  const info = await client.getCollection(collection);
  const sparse = (info.config.params as Record<string, unknown>)['sparse_vectors'] as
    Record<string, unknown> | undefined;
  return Boolean(sparse?.[BM25_SPARSE_VECTOR_NAME]);
}

async function collectionExists(client: QdrantClient, name: string): Promise<boolean> {
  const { collections } = await client.getCollections();
  return collections.some((c) => c.name === name);
}

async function createTargetCollection(
  client: QdrantClient,
  target: string,
  source: string,
  dims: number
): Promise<void> {
  const schema = COLLECTION_SCHEMAS[source];
  if (!schema) {
    console.warn(
      `  ${source} has no entry in COLLECTION_SCHEMAS — creating ${target} without payload indexes`
    );
    await client.createCollection(target, {
      vectors: { size: dims, distance: 'Cosine' },
      sparse_vectors: { [BM25_SPARSE_VECTOR_NAME]: { modifier: 'idf' } },
    });
    return;
  }

  const config = getCollectionConfig(dims, schema);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.createCollection(target, config as any);
  for (const index of schema.indexes ?? []) {
    try {
      await client.createPayloadIndex(target, {
        field_name: index.field,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        field_schema: INDEX_TYPES[index.type] as any,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        console.warn(`  index ${index.field} on ${target} failed: ${message}`);
      }
    }
  }
}

async function buildOne(
  client: QdrantClient,
  candidate: EmbedCandidate,
  source: string,
  limit: number | null
): Promise<void> {
  const target = evalCollectionName(candidate.slug, source);
  console.log(`\n── ${source} → ${target} (${candidate.model}, ${candidate.dims} dims) ──`);

  if (!(await collectionExists(client, source))) {
    throw new Error(`source collection "${source}" does not exist`);
  }

  // Ein halb gefüllter Aufbau aus einem abgebrochenen Lauf sähe wie eine
  // vollständige Messung aus. Neu bauen ist teurer als fortsetzen und die
  // einzige Variante, die nicht still das Falsche misst.
  if (await collectionExists(client, target)) {
    await deleteEvalCollections([target], (name) => client.deleteCollection(name));
    console.log(`  dropped the previous ${target}`);
  }

  const withSparse = await hasSparseVector(client, source);
  console.log(`  sparse vector on the source: ${withSparse ? 'yes, copied' : 'no'}`);
  await createTargetCollection(client, target, source, candidate.dims);

  // Der Stapel-Einbetter wird hier umwickelt, damit der Cortecs-Unterauftrag-
  // nehmer im Protokoll steht. Nicht je Stapel — das wären Tausende gleicher
  // Zeilen —, sondern beim ersten und bei jedem Wechsel.
  const base = createProviderBatchEmbedder(candidate);
  let lastUpstream: string | null = null;
  const embedder = createCandidateEmbedder(candidate, async (values) => {
    const result = await base(values);
    for (const upstream of result.upstreams) {
      if (upstream !== null && upstream !== lastUpstream) {
        console.log(`  x-cortecs-provider: ${upstream}`);
        lastUpstream = upstream;
      }
    }
    return result;
  });

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
      with_vector: withSparse ? [BM25_SPARSE_VECTOR_NAME] : false,
      ...(offset != null && { offset }),
    });

    const usable: SourcePoint[] = [];
    const texts: string[] = [];
    for (const point of page.points) {
      const payload = point.payload as Record<string, unknown> | null;
      const text = pointText(payload);
      if (text === null) {
        skipped += 1;
        continue;
      }
      usable.push({ id: point.id, payload, vector: point.vector });
      texts.push(text);
    }

    if (usable.length > 0) {
      const vectors = await embedder.embedDocuments(texts);
      const points = usable.map((point, i) => toEvalPoint(point, vectors[i], expiresAt));
      for (let i = 0; i < points.length; i += UPSERT_BATCH) {
        await client.upsert(target, {
          wait: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          points: points.slice(i, i + UPSERT_BATCH) as any,
        });
      }
      copied += points.length;
      console.log(`  ${copied} points embedded and upserted`);
    }

    offset = page.next_page_offset as string | number | null;
    if (offset == null) break;
  }

  const upstreams = Object.entries(embedder.stats.upstreams)
    .map(([name, count]) => `${name}×${count}`)
    .join(', ');
  console.log(
    `  done: ${copied} points, ${skipped} without text, ` +
      `${embedder.stats.tokens} tokens in ${embedder.stats.batches} batches` +
      (upstreams.length > 0 ? ` (${upstreams})` : '')
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Erst prüfen, dann verbinden: ein Tippfehler im Slug soll auch ohne
  // Qdrant-Schlüssel als Tippfehler gemeldet werden, nicht als fehlender Key.
  const candidate = args.delete ? null : validateBuildArgs(args);

  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  if (args.delete) {
    const { collections } = await client.getCollections();
    const dropped = await deleteEvalCollections(
      collections.map((c) => c.name),
      (name) => client.deleteCollection(name)
    );
    console.log(
      dropped.length === 0
        ? 'No eval_embed_* collections to drop.'
        : `Dropped ${dropped.length}:\n  ${dropped.join('\n  ')}`
    );
    process.exit(0);
  }

  if (candidate === null) usage();

  const sources = args.collections.map(resolveSourceCollection);
  console.log(
    `Building ${sources.length} collection(s) for ${candidate.slug} against ` +
      `${env.QDRANT_URL ?? 'QDRANT_URL unset!'}` +
      (args.limit === null ? '' : ` (limit ${args.limit} points per collection)`)
  );

  for (const source of sources) {
    await buildOne(client, candidate, source, args.limit);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('build-eval-embed-collection failed:', error);
  process.exit(1);
});
