/**
 * Stage inspector for the manual search field — prints the result order after
 * every stage of the pipeline, so a ranking regression can be pinned to the
 * stage that caused it instead of guessed at from the final list.
 *
 *   pnpm --filter @gruenerator/api eval:manual:stages -- Hitzeschutz berlin-system
 *
 * Stages: search → `rankManualSearchResults` (dedupe + cut + order, exactly
 * what the route serves — there is no rerank stage any more). Documents
 * carrying the query term in their title are marked, because for a keyword
 * lookup those are the ones that belong on top; watching where they fall out
 * localises the defect. Each row shows the fused score, the dense cosine and
 * the verbatim term-chunk count, the three inputs of the cut.
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
const { rankManualSearchResults, SYSTEM_COLLECTION_MIN_SCORE } =
  await import('../../services/search/manualSearchRanking.js');

import type { DocumentResult } from '../../services/BaseSearchService/types.js';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MANUAL_VECTOR_WEIGHT = 0.7;
const MANUAL_TEXT_WEIGHT = 0.3;
const RESULT_LIMIT = 30;
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
    const dense = r.dense_similarity_score?.toFixed(3) ?? '  –  ';
    const terms = String(r.term_chunk_count ?? 0).padStart(2);
    const title = (r.title ?? '?').slice(0, 66);
    console.log(
      `${String(i + 1).padStart(2)}. ${score}  cos ${dense}  term ${terms}  ${title}${carriesTerm(r.title) ? '  ← Titel' : ''}`
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

  const served = rankManualSearchResults({
    results,
    sortBy: 'relevance',
    limit: RESULT_LIMIT,
    minScore: SYSTEM_COLLECTION_MIN_SCORE,
  });
  show(
    `2) Ausgeliefert: ≥${SYSTEM_COLLECTION_MIN_SCORE} oder Begriff im Text (${served.length} übrig)`,
    served
  );

  process.exit(0);
}

main().catch((error) => {
  console.error('Stage inspection failed:', error);
  process.exit(1);
});
