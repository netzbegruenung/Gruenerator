/**
 * Stage inspector for the manual search field — prints the result order after
 * every stage of the pipeline, so a ranking regression can be pinned to the
 * stage that caused it instead of guessed at from the final list.
 *
 *   pnpm --filter @gruenerator/api eval:manual:stages -- Hitzeschutz berlin-system
 *
 * Stages: search → dedupe+threshold → cross-encoder without MMR → with MMR
 * (what production serves). Documents carrying the query term in their title
 * are marked, because for a keyword lookup those are the ones that belong on
 * top; watching where they fall out localises the defect.
 *
 * Companion to annRecallCheck.ts (which diagnoses the ANN layer below this).
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules — see runRetrievalEval.ts for why.
dotenv.config();

const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { rerankPipeline } = await import('../../services/search/rerankPipeline.js');

import type { DocumentResult } from '../../services/BaseSearchService/types.js';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MANUAL_VECTOR_WEIGHT = 0.7;
const MANUAL_TEXT_WEIGHT = 0.3;
const MANUAL_MIN_SCORE = 0.35;
const RERANK_INPUT_LIMIT = 30;
const SHOWN_PER_STAGE = 8;

const query = process.argv[2] ?? 'Hitzeschutz';
const collectionId = process.argv[3] ?? 'berlin-system';
/** Prefix match keeps German compounds ("Hitzeschutzplan") in scope. */
const termStem = query.toLowerCase().slice(0, 8);

const carriesTerm = (title: string | undefined): boolean =>
  (title ?? '').toLowerCase().includes(termStem);

function show(label: string, results: DocumentResult[]): void {
  console.log(`\n── ${label} ──`);
  results.slice(0, SHOWN_PER_STAGE).forEach((r, i) => {
    const score = r.similarity_score.toFixed(3);
    const title = (r.title ?? '?').slice(0, 66);
    console.log(
      `${String(i + 1).padStart(2)}. ${score}  ${title}${carriesTerm(r.title) ? '  ← Titel' : ''}`
    );
  });
}

async function main(): Promise<void> {
  const config = getSystemCollectionConfig(collectionId);
  if (!config) {
    console.error(`Unbekannte Collection: ${collectionId}`);
    process.exit(1);
  }

  const params = getSearchParams(collectionId);
  const service = new DocumentSearchService();

  const resp = await service.search({
    query,
    userId: undefined,
    options: {
      limit: params.limit,
      mode: 'hybrid',
      vectorWeight: MANUAL_VECTOR_WEIGHT,
      textWeight: MANUAL_TEXT_WEIGHT,
      threshold: params.threshold,
      searchCollection: config.qdrantCollection,
      recallLimit: params.recallLimit,
      qualityMin: params.qualityMin,
      additionalFilter: applyDefaultFilter(collectionId, undefined),
    },
  } as Parameters<DocumentSearchService['search']>[0]);

  const results = (resp.results ?? []) as DocumentResult[];
  const titleHits = results.filter((r) => carriesTerm(r.title)).length;
  console.log(
    `\n"${query}" @ ${collectionId}: ${results.length} Dokumente, davon ${titleHits} mit dem Begriff im Titel`
  );
  show('1) Suchergebnis', results);

  const bestByKey = new Map<string, DocumentResult>();
  for (const r of results) {
    const key = r.source_url || r.document_id;
    const existing = bestByKey.get(key);
    if (!existing || r.similarity_score > existing.similarity_score) bestByKey.set(key, r);
  }
  const deduped = Array.from(bestByKey.values())
    .filter((r) => r.similarity_score >= MANUAL_MIN_SCORE)
    .sort((a, b) => b.similarity_score - a.similarity_score);
  show(`2) Dedup + Schwelle ≥${MANUAL_MIN_SCORE} (${deduped.length} übrig)`, deduped);

  const candidates = deduped.slice(0, RERANK_INPUT_LIMIT);
  const items = candidates.map((r) => ({
    title: r.title ?? '',
    content: (r.relevant_content ?? '').slice(0, 500),
    relevance: r.similarity_score,
  }));

  for (const applyDiversity of [false, true]) {
    const { rankedIndices, scores } = await rerankPipeline({
      query,
      items,
      inputLimit: RERANK_INPUT_LIMIT,
      outputLimit: RERANK_INPUT_LIMIT,
      minRelevance: 0.05,
      minKeep: Math.min(5, candidates.length),
      applyDiversity,
    });
    const ranked = rankedIndices.flatMap((i) => {
      const candidate = candidates[i];
      if (!candidate) return [];
      return [{ ...candidate, similarity_score: scores.get(i) ?? candidate.similarity_score }];
    });
    show(`3) Rerank ${applyDiversity ? 'mit MMR (Produktionsstand)' : 'ohne MMR'}`, ranked);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Stage inspection failed:', error);
  process.exit(1);
});
