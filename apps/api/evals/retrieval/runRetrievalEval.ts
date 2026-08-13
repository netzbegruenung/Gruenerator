/**
 * Retrieval eval runner — measures Hit@k and MRR over the PRODUCTION search
 * path (documentSearchService.search with the same params NotebookQAService
 * uses), against the live Qdrant instance from QDRANT_URL.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval
 *
 * Env:
 *   EVAL_COLLECTION  only run cases for this collection id (substring match)
 *   EVAL_FILTER      only run cases whose id contains this substring
 *   EVAL_DEPTH       depth profile: fast | deep | ultra (default fast)
 *   EVAL_RERANK=1    additionally score the post-rerank ranking (Regolo)
 *   EVAL_VERBOSE=1   print top-5 titles for every miss (gold-label curation)
 *   EVAL_OUT         write per-case results as JSON to this path
 *
 * A case scores at rank r when the first matching result appears at position
 * r (1-based). Metrics: Hit@1 / Hit@3 / Hit@5, MRR@10 — per collection and
 * overall. Baseline discipline: run once before a retrieval change, once
 * after, compare the two EVAL_OUT files.
 */
import { writeFileSync } from 'node:fs';

import dotenv from 'dotenv';

// Load .env BEFORE the app modules: static imports would be hoisted above
// dotenv.config(), so config/env.js would parse an empty environment and the
// search service would silently degrade to zero results.
dotenv.config();

const { getNotebookDepthProfile, applyDepthProfile } =
  await import('../../config/notebookDepthProfiles.js');
const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { rerankPipeline } = await import('../../services/search/rerankPipeline.js');

const { RETRIEVAL_CASES } = await import('./cases.js');

import { type RetrievalCase } from './cases.js';

import type { DocumentResult } from '../../services/BaseSearchService/types.js';
import type { NotebookDepth } from '@gruenerator/contracts';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MRR_K = 10;
const HIT_KS = [1, 3, 5] as const;

interface CaseOutcome {
  id: string;
  collection: string;
  query: string;
  rank: number | null;
  rerankRank?: number | null;
  topTitles: string[];
  error?: string;
}

function firstMatchRank(results: DocumentResult[], evalCase: RetrievalCase): number | null {
  for (let i = 0; i < results.length; i++) {
    const title = results[i].title || results[i].filename || '';
    const url = results[i].source_url || '';
    const matched = evalCase.expect.some((exp) => {
      const titleOk = exp.titlePattern ? new RegExp(exp.titlePattern, 'i').test(title) : false;
      const urlOk = exp.urlPattern ? new RegExp(exp.urlPattern, 'i').test(url) : false;
      return titleOk || urlOk;
    });
    if (matched) return i + 1;
  }
  return null;
}

async function runCase(
  searchService: DocumentSearchService,
  evalCase: RetrievalCase,
  depth: NotebookDepth,
  withRerank: boolean
): Promise<CaseOutcome> {
  const config = getSystemCollectionConfig(evalCase.collection);
  if (!config) {
    return {
      id: evalCase.id,
      collection: evalCase.collection,
      query: evalCase.query,
      rank: null,
      topTitles: [],
      error: `unknown collection id: ${evalCase.collection}`,
    };
  }

  const profile = getNotebookDepthProfile(depth);
  const searchParams = applyDepthProfile(getSearchParams(evalCase.collection), profile);
  const additionalFilter = applyDefaultFilter(evalCase.collection, undefined);

  try {
    const resp = await searchService.search({
      query: evalCase.query,
      userId: undefined,
      options: {
        limit: searchParams.limit,
        mode: searchParams.mode,
        vectorWeight: searchParams.vectorWeight,
        textWeight: searchParams.textWeight,
        threshold: searchParams.threshold,
        searchCollection: config.qdrantCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        additionalFilter,
      },
    } as Parameters<DocumentSearchService['search']>[0]);

    if (resp.success === false) {
      return {
        id: evalCase.id,
        collection: evalCase.collection,
        query: evalCase.query,
        rank: null,
        topTitles: [],
        error: resp.error || resp.message || 'search returned success=false',
      };
    }

    const results = (resp.results || []) as DocumentResult[];
    const outcome: CaseOutcome = {
      id: evalCase.id,
      collection: evalCase.collection,
      query: evalCase.query,
      rank: firstMatchRank(results, evalCase),
      topTitles: results.slice(0, 5).map((r) => r.title || r.filename || r.source_url || '?'),
    };

    if (withRerank && results.length > 2) {
      const rerank = await rerankPipeline({
        query: evalCase.query,
        items: results.map((r) => ({
          title: r.title || '',
          content: r.relevant_content || '',
        })),
        inputLimit: results.length,
        outputLimit: MRR_K,
        minRelevance: 0,
      });
      if (!rerank.failed) {
        const reranked = rerank.rankedIndices.map((i) => results[i]);
        outcome.rerankRank = firstMatchRank(reranked, evalCase);
      }
    }

    return outcome;
  } catch (error) {
    return {
      id: evalCase.id,
      collection: evalCase.collection,
      query: evalCase.query,
      rank: null,
      topTitles: [],
      error: (error as Error).message,
    };
  }
}

function computeMetrics(outcomes: CaseOutcome[], rankOf: (o: CaseOutcome) => number | null) {
  const n = outcomes.length;
  const hits = Object.fromEntries(HIT_KS.map((k) => [k, 0])) as Record<number, number>;
  let mrrSum = 0;
  for (const o of outcomes) {
    const rank = rankOf(o);
    if (rank === null) continue;
    for (const k of HIT_KS) if (rank <= k) hits[k]++;
    if (rank <= MRR_K) mrrSum += 1 / rank;
  }
  const pct = (x: number) => ((100 * x) / Math.max(1, n)).toFixed(1).padStart(5);
  return {
    line:
      HIT_KS.map((k) => `Hit@${k} ${pct(hits[k])}%`).join('  ') +
      `  MRR@${MRR_K} ${(mrrSum / Math.max(1, n)).toFixed(3)}`,
  };
}

async function main() {
  const depth = (process.env.EVAL_DEPTH || 'fast') as NotebookDepth;
  const withRerank = process.env.EVAL_RERANK === '1';
  const verbose = process.env.EVAL_VERBOSE === '1';
  const collectionFilter = process.env.EVAL_COLLECTION;
  const idFilter = process.env.EVAL_FILTER;

  let cases = RETRIEVAL_CASES;
  if (collectionFilter) cases = cases.filter((c) => c.collection.includes(collectionFilter));
  if (idFilter) cases = cases.filter((c) => c.id.includes(idFilter));

  if (cases.length === 0) {
    console.error('No cases match the given filters.');
    process.exit(1);
  }

  console.log(
    `Running ${cases.length} retrieval cases (depth=${depth}${withRerank ? ', +rerank' : ''}) against ${process.env.QDRANT_URL || 'QDRANT_URL unset!'}`
  );

  const searchService = new DocumentSearchService();
  const outcomes: CaseOutcome[] = [];
  for (const evalCase of cases) {
    const outcome = await runCase(searchService, evalCase, depth, withRerank);
    outcomes.push(outcome);
    const rankLabel = outcome.error
      ? `ERROR ${outcome.error}`
      : outcome.rank === null
        ? 'miss'
        : `rank ${outcome.rank}${outcome.rerankRank !== undefined ? ` → rerank ${outcome.rerankRank ?? 'miss'}` : ''}`;
    console.log(
      `  ${outcome.rank !== null ? '✓' : '✗'} [${outcome.collection}] ${outcome.id}: ${rankLabel}`
    );
    if (verbose && outcome.rank === null && !outcome.error) {
      for (const t of outcome.topTitles) console.log(`      • ${t}`);
    }
  }

  const byCollection = new Map<string, CaseOutcome[]>();
  for (const o of outcomes) {
    const list = byCollection.get(o.collection) ?? [];
    list.push(o);
    byCollection.set(o.collection, list);
  }

  console.log('\n── Ergebnisse (Retrieval) ──');
  for (const [collection, list] of byCollection) {
    console.log(
      `${collection.padEnd(28)} n=${String(list.length).padStart(2)}  ${computeMetrics(list, (o) => o.rank).line}`
    );
  }
  console.log(
    `${'GESAMT'.padEnd(28)} n=${String(outcomes.length).padStart(2)}  ${computeMetrics(outcomes, (o) => o.rank).line}`
  );

  if (withRerank) {
    console.log('\n── Ergebnisse (nach Rerank) ──');
    console.log(
      `${'GESAMT'.padEnd(28)} n=${String(outcomes.length).padStart(2)}  ${computeMetrics(outcomes, (o) => o.rerankRank ?? o.rank).line}`
    );
  }

  const errors = outcomes.filter((o) => o.error);
  if (errors.length > 0) {
    console.log(`\n${errors.length} Fälle mit Fehlern — Metriken entsprechend unvollständig.`);
  }

  if (process.env.EVAL_OUT) {
    writeFileSync(process.env.EVAL_OUT, JSON.stringify({ depth, withRerank, outcomes }, null, 2));
    console.log(`\nErgebnisse geschrieben: ${process.env.EVAL_OUT}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Eval failed:', error);
  process.exit(1);
});
