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
 * Filtered arm (#3189): production never queries `documents` unfiltered. A
 * notebook search narrows it with `{ key: 'document_id', match: { any } }`, a
 * search over all of one user's uploads with `{ key: 'user_id', match }` (see
 * DocumentSearchService/searchOperations.ts). This arm runs the two eval
 * notebook questions plus `ANN_PROBE_QUESTIONS` under both shapes: every
 * distinct eval notebook filter, and the `USER_FILTER_COUNT` users with the most
 * points (from a live facet, so the arm follows the collection as it grows).
 *
 * A filtered 100 % can be meaningless. Below `full_scan_threshold` (checked per
 * segment) Qdrant answers a filter exactly through the payload index; the
 * eval notebook (~1 350 points) always lands there, and so did the first
 * version of this arm (2026-09-03, "100.0 %"). Every filter therefore also runs
 * with `hnsw_ef: 1`: a graph walk with the smallest beam loses neighbours, a
 * full scan cannot. A row whose control also reads 100 % is marked as a full
 * scan and says nothing about HNSW.
 *
 * The rows are reported as their own block and are NOT folded into GESAMT, so
 * GESAMT stays comparable across runs. User ids are not printed, only rank and
 * point count.
 */
import dotenv from 'dotenv';

import { type RecallStats } from './documentsArms.js';

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
const { answeredByFullScan, distinctNotebookFilters } = await import('./documentsArms.js');

const K = 10;
const DOCUMENTS_COLLECTION = 'documents';
/** The largest per-user filters; the ones where HNSW actually has to work. */
const USER_FILTER_COUNT = 5;

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

  // Filtered arm on `documents` (#3189) — see module docblock.
  if (candidate) {
    console.log('\n(documents-Arm übersprungen: `documents` ist keine Bake-off-Quelle.)');
  } else {
    await reportDocumentsArm(client);
  }

  process.exit(0);
}

type Filter = { must: Array<{ key: string; match: { any: string[] } | { value: string } }> };

async function reportDocumentsArm(client: ReturnType<typeof createQdrantClient>): Promise<void> {
  const notebookCases = RETRIEVAL_CASES.filter(
    (c) => c.kind === 'notebook' && (c.notebook?.user?.documentIds?.length ?? 0) > 0
  );
  const questions = [...notebookCases.map((c) => c.query), ...ANN_PROBE_QUESTIONS];
  const vectors: number[][] = [];
  for (const question of questions) {
    vectors.push(await mistralEmbeddingService.generateEmbedding(question));
  }

  const facet = await client.facet(DOCUMENTS_COLLECTION, {
    key: 'user_id',
    limit: USER_FILTER_COUNT,
    exact: true,
  });
  const arms: Array<{ label: string; filter: Filter | null }> = [
    { label: 'unfiltered (nicht Produktion)', filter: null },
    ...distinctNotebookFilters(notebookCases).map((n) => ({
      label: `notebook ${n.label}`,
      filter: { must: [{ key: 'document_id', match: { any: n.documentIds } }] },
    })),
    ...facet.hits.map((hit, i) => ({
      label: `user_id #${i + 1}`,
      filter: { must: [{ key: 'user_id', match: { value: String(hit.value) } }] },
    })),
  ];

  const info = await client.getCollection(DOCUMENTS_COLLECTION);
  console.log(`\n── ${DOCUMENTS_COLLECTION} (gefiltert wie in Produktion; nicht in GESAMT) ──`);
  console.log(
    `segments_count=${info.segments_count ?? 'unknown'} ` +
      `indexed_vectors_count=${info.indexed_vectors_count ?? 'unknown'} ` +
      `points_count=${info.points_count ?? 'unknown'} · ${vectors.length} Fragen je Zeile`
  );
  console.log(`${'Filter'.padEnd(40)} ${'Punkte'.padStart(7)}  recall@${K}  hnsw_ef=1`);

  const pct = (s: RecallStats) => `${((100 * s.overlap) / Math.max(1, s.total)).toFixed(1)}%`;
  let engagedBelowTarget = false;
  for (const arm of arms) {
    const points = arm.filter
      ? (await client.count(DOCUMENTS_COLLECTION, { filter: arm.filter, exact: true })).count
      : (info.points_count ?? 0);
    const standard: RecallStats = { overlap: 0, total: 0 };
    const minimalEf: RecallStats = { overlap: 0, total: 0 };
    for (const vector of vectors) {
      const base = {
        query: vector,
        limit: K,
        with_payload: false,
        ...(arm.filter && { filter: arm.filter }),
      };
      const [exact, approx, approxMinimal] = await Promise.all([
        client.query(DOCUMENTS_COLLECTION, { ...base, params: { exact: true } }),
        client.query(DOCUMENTS_COLLECTION, base),
        client.query(DOCUMENTS_COLLECTION, { ...base, params: { hnsw_ef: 1 } }),
      ]);
      const exactIds = idsOf(exact.points);
      addStats(standard, recallAtK(idsOf(approx.points), exactIds));
      addStats(minimalEf, recallAtK(idsOf(approxMinimal.points), exactIds));
    }
    const fullScan = answeredByFullScan(minimalEf);
    if (!fullScan && arm.filter && (100 * standard.overlap) / Math.max(1, standard.total) < 95) {
      engagedBelowTarget = true;
    }
    console.log(
      `${arm.label.padEnd(40)} ${String(points).padStart(7)}  ${pct(standard).padStart(8)}  ` +
        `${pct(minimalEf).padStart(9)}${fullScan ? '  Full-Scan, HNSW nicht gemessen' : ''}`
    );
  }
  if (engagedBelowTarget) {
    console.log(
      '\nEin Produktionsfilter mit HNSW liegt unter 95% — hnsw_ef/ef_construct auf documents prüfen.'
    );
  }
}

function addStats(into: RecallStats, add: RecallStats): void {
  into.overlap += add.overlap;
  into.total += add.total;
}

main().catch((error) => {
  console.error('ANN recall check failed:', error);
  process.exit(1);
});
