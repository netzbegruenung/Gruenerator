/**
 * ANN-vs-exact recall check (qdrant-search-quality diagnosis pattern):
 * runs every eval query twice against Qdrant — approximate HNSW and
 * exact=true — and reports the overlap as recall@k. Separates "the HNSW
 * index misses points" (tune ef/m) from "the embedding/pipeline is wrong"
 * (which the main eval measures). Target: >95% recall@k.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:ann
 *
 * Env:
 *   EVAL_EMBED_CANDIDATE  Slug aus `embedCandidates.ts` — prüft dieselbe Frage
 *                    gegen die Wegwerf-Sammlung eines Bake-off-Kandidaten
 *                    (`eval_embed_<slug>__<quelle>`, gebaut von
 *                    `eval:retrieval:embed:build`), mit dessen Anfrage-
 *                    Einbettung. Nötig, weil eine frisch angelegte Sammlung
 *                    ihren HNSW-Index erst noch bauen muss: eine Kandidatenzahl
 *                    aus dem Hauptlauf ist ohne diese Prüfung nicht von einem
 *                    halb indizierten Index zu unterscheiden.
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
 *
 * The 2 real `notebook.user` cases give only 2 query vectors — too few to
 * read anything into a filtered-vs-unfiltered gap. `ANN_PROBE_QUESTIONS`
 * broadens that to 10 short municipal/state-politics questions, each run
 * against EACH user notebook's document-id filter (documents (filtered,
 * notebook) below), plus once unfiltered per question (same vector). The
 * `documents` rows are reported as their own block, separate from the main
 * per-collection table, and are NOT folded into GESAMT — GESAMT stays
 * comparable across runs regardless of how many probe questions this arm
 * adds.
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules (static imports would be hoisted above it).
dotenv.config();

const { env } = await import('../../config/env.js');
const { getSystemCollectionConfig } = await import('../../config/systemCollectionsConfig.js');
const { createQdrantClient } = await import('../../database/services/QdrantService/connection.js');
const { mistralEmbeddingService } = await import('../../services/mistral/index.js');
const { RETRIEVAL_CASES } = await import('./cases.js');
const { resolveEvalCandidate, resolveEvalTarget } = await import('./embedCandidates.js');
const { createCandidateEmbedder } = await import('./candidateEmbedder.js');
const { recallAtK } = await import('./recallAtK.js');

const K = 10;
const DOCUMENTS_COLLECTION = 'documents';

/**
 * Ten short German questions spanning municipal/state-politics topics
 * (budget, procurement, heat planning, housing, transport, climate
 * adaptation, digitalisation, participation, biodiversity, energy) — a
 * broader probe set than the 2 real `notebook.user` eval cases on their own.
 */
const ANN_PROBE_QUESTIONS: string[] = [
  'Wie hoch ist der Haushaltsansatz für dieses Jahr?',
  'Welche Fristen gelten bei einer öffentlichen Vergabe?',
  'Was sieht die kommunale Wärmeplanung vor?',
  'Wie wird bezahlbarer Wohnraum geschaffen?',
  'Welche Maßnahmen verbessern den öffentlichen Nahverkehr?',
  'Wie bereitet sich die Gemeinde auf Starkregen und Hitze vor?',
  'Welche Projekte treiben die Digitalisierung der Verwaltung voran?',
  'Wie können Bürgerinnen und Bürger an Entscheidungen beteiligt werden?',
  'Welche Schritte schützen die Artenvielfalt vor Ort?',
  'Wie soll die Energieversorgung künftig aussehen?',
];

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

function idsOf(points: Array<{ id: string | number }>): string[] {
  return points.map((p) => String(p.id));
}

async function main() {
  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  // Wirft bei unbekanntem Slug, statt still gegen die Produktion zu messen.
  const candidate = resolveEvalCandidate(process.env);
  const embedder = candidate ? createCandidateEmbedder(candidate) : null;
  if (candidate) {
    console.log(
      `Embedding candidate: ${candidate.slug} (${candidate.provider}, ${candidate.model}, ${candidate.dims} dims)`
    );
  } else {
    // Nur der Produktionsarm braucht Mistral; ein Kandidatenlauf soll ohne
    // MISTRAL_API_KEY durchgehen.
    await mistralEmbeddingService.init();
  }

  const perCollection = new Map<string, { overlap: number; total: number }>();
  /**
   * Wegwerf-Sammlungen, die es nicht gibt.
   *
   * Ein Kandidat wird oft nur gegen einen Teil der Sammlungen gebaut. Ohne
   * diesen Zweig bräche der erste solche Fall den ganzen Lauf ab, und die
   * Tabelle für die tatsächlich gebauten Sammlungen — die eigentliche Auskunft
   * darüber, ob deren HNSW-Index schon steht — käme nie zustande.
   */
  const notBuilt = new Set<string>();

  for (const evalCase of RETRIEVAL_CASES) {
    const config = getSystemCollectionConfig(evalCase.collection);
    if (!config) continue;

    const target = resolveEvalTarget(process.env, config.qdrantCollection);
    // Vor dem Einbetten prüfen: eine fehlende Sammlung soll nicht 52-mal
    // bezahlt werden.
    if (notBuilt.has(target.collection)) continue;

    const vector = embedder
      ? await embedder.embedQuery(evalCase.query)
      : await mistralEmbeddingService.generateEmbedding(evalCase.query);

    let approx;
    let exact;
    try {
      [approx, exact] = await Promise.all([
        client.query(target.collection, { query: vector, limit: K, with_payload: false }),
        client.query(target.collection, {
          query: vector,
          limit: K,
          with_payload: false,
          params: { exact: true },
        }),
      ]);
    } catch (error) {
      // Nur im Kandidatenarm nachsichtig: im Produktionsarm IST eine fehlende
      // Sammlung der Befund und darf nicht als Zeile durchgehen.
      if (!candidate) throw error;
      notBuilt.add(target.collection);
      console.warn(
        `  ${target.collection}: not built — ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    recordStats(
      perCollection,
      target.collection,
      recallAtK(idsOf(approx.points), idsOf(exact.points))
    );
  }

  console.log(`── ANN recall@${K} (approximate vs exact) ──`);
  let sumOverlap = 0;
  let sumTotal = 0;
  for (const [collection, { overlap, total }] of perCollection) {
    sumOverlap += overlap;
    sumTotal += total;
    console.log(`${collection.padEnd(32)} ${((100 * overlap) / Math.max(1, total)).toFixed(1)}%`);
  }
  for (const collection of notBuilt) {
    console.log(`${collection.padEnd(32)} not built`);
  }
  const overallPct = (100 * sumOverlap) / Math.max(1, sumTotal);
  console.log(`${'GESAMT'.padEnd(32)} ${overallPct.toFixed(1)}%`);
  if (notBuilt.size > 0) {
    console.log(
      `\n${notBuilt.size} Sammlung(en) nicht gebaut — GESAMT deckt sie nicht ab. ` +
        `Mit eval:retrieval:embed:build nachbauen, sonst misst der Hauptlauf dort ins Leere.`
    );
  }
  if (overallPct < 95) {
    console.log('\nUnter 95% — HNSW-Tuning prüfen (hnsw_ef erhöhen, ggf. ef_construct/m).');
  }

  // Filtered arm on `documents` (#3189) — see module docblock. Reported as
  // its own block, separate from (and excluded from) GESAMT above: it
  // measures a different collection under a different query shape, so
  // averaging it in would make GESAMT depend on how many probe questions
  // this arm happens to run.
  const notebookDocumentCases = RETRIEVAL_CASES.filter(
    (c) =>
      c.kind === 'notebook' &&
      c.notebook?.user?.documentIds !== undefined &&
      c.notebook.user.documentIds.length > 0
  );

  if (candidate) {
    console.log('\n(documents-Arm übersprungen: `documents` ist keine Bake-off-Quelle.)');
  } else if (notebookDocumentCases.length > 0) {
    const documentsStats = {
      filtered: { overlap: 0, total: 0 },
      unfiltered: { overlap: 0, total: 0 },
    };

    const record = (arm: 'filtered' | 'unfiltered', result: { overlap: number; total: number }) => {
      documentsStats[arm].overlap += result.overlap;
      documentsStats[arm].total += result.total;
    };

    // The 2 real eval cases: each case's own query against its own notebook.
    for (const evalCase of notebookDocumentCases) {
      const documentIds = evalCase.notebook!.user!.documentIds;
      const filter = { must: [{ key: 'document_id', match: { any: documentIds } }] };
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

      record('filtered', recallAtK(idsOf(approxFiltered.points), idsOf(exactFiltered.points)));
      record(
        'unfiltered',
        recallAtK(idsOf(approxUnfiltered.points), idsOf(exactUnfiltered.points))
      );
    }

    // Probe questions: 2 real-case vectors are too few to read anything into
    // a filtered-vs-unfiltered gap. Run every probe question against EACH
    // user notebook's document-id filter, plus once unfiltered per question
    // (same vector — the unfiltered query doesn't depend on the notebook).
    const userNotebooks = notebookDocumentCases.map((c) => ({
      id: c.id,
      documentIds: c.notebook!.user!.documentIds,
    }));

    for (const question of ANN_PROBE_QUESTIONS) {
      const vector = await mistralEmbeddingService.generateEmbedding(question);

      const [approxUnfiltered, exactUnfiltered] = await Promise.all([
        client.query(DOCUMENTS_COLLECTION, { query: vector, limit: K, with_payload: false }),
        client.query(DOCUMENTS_COLLECTION, {
          query: vector,
          limit: K,
          with_payload: false,
          params: { exact: true },
        }),
      ]);
      record(
        'unfiltered',
        recallAtK(idsOf(approxUnfiltered.points), idsOf(exactUnfiltered.points))
      );

      for (const notebook of userNotebooks) {
        const filter = { must: [{ key: 'document_id', match: { any: notebook.documentIds } }] };
        const [approxFiltered, exactFiltered] = await Promise.all([
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
        ]);
        record('filtered', recallAtK(idsOf(approxFiltered.points), idsOf(exactFiltered.points)));
      }
    }

    const collectionInfo = await client.getCollection(DOCUMENTS_COLLECTION);
    const pct = (stats: { overlap: number; total: number }) =>
      ((100 * stats.overlap) / Math.max(1, stats.total)).toFixed(1);

    console.log(
      `\n── ${DOCUMENTS_COLLECTION} (notebook, filtered vs unfiltered; excluded from GESAMT) ──`
    );
    console.log(
      `segments_count=${collectionInfo.segments_count ?? 'unknown'} ` +
        `indexed_vectors_count=${collectionInfo.indexed_vectors_count ?? 'unknown'}`
    );
    console.log(
      `${`${DOCUMENTS_COLLECTION} (filtered, notebook)`.padEnd(32)} ${pct(documentsStats.filtered)}%`
    );
    console.log(
      `${`${DOCUMENTS_COLLECTION} (unfiltered, notebook)`.padEnd(32)} ${pct(documentsStats.unfiltered)}%`
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('ANN recall check failed:', error);
  process.exit(1);
});
