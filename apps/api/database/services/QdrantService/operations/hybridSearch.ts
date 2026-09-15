/**
 * Hybrid Search Operations
 * Combines vector and text search with various fusion methods
 */

import { type QdrantClient, type Schemas } from '@qdrant/js-client-rest';

import { BM25_SPARSE_VECTOR_NAME } from '../../../../config/qdrantCollectionsSchema.js';
import { vectorConfig } from '../../../../config/vectorConfig.js';
import {
  encodeBm25Query,
  generateQueryVariants,
  normalizeQuery,
  tokenizeQuery,
} from '../../../../services/text/index.js';
import { createLogger } from '../../../../utils/logger.js';

import { collectionSupportsBm25 } from './batchOperations.js';
import { vectorSearch } from './vectorSearch.js';

import type {
  HybridSearchOptions,
  HybridSearchResponse,
  HybridSearchResult,
  VectorSearchResult,
  TextSearchResult,
  HybridConfig,
  RRFScoringItem,
  WeightedScoringItem,
  VariantSearchResult,
  QdrantFilter,
} from './types.js';
import type { SparseVector } from '../../../../services/text/index.js';

const logger = createLogger('QdrantOperations:hybridSearch');

/**
 * Get hybrid config from vectorConfig
 */
function getHybridConfig(): HybridConfig {
  return vectorConfig.get('hybrid') as HybridConfig;
}

/** Score a keyword hit gets per occurrence of the term in the chunk. */
const TEXT_SCORE_PER_MATCH = 0.1;
/** Ceiling for term frequency — beyond this, more repetitions say nothing. */
const TEXT_SCORE_MAX = 0.8;
/** Every keyword hit is worth at least this much. */
const TEXT_SCORE_FLOOR = 0.1;

/**
 * Perform hybrid search combining vector and keyword search
 */
export async function hybridSearch(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  query: string,
  filter: QdrantFilter = {},
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const hybridCfg = getHybridConfig();
  const {
    limit = 10,
    threshold = 0.3,
    vectorWeight = 0.7,
    textWeight = 0.3,
    useRRF = true,
    rrfK = 60,
    recallLimit,
  } = options;

  try {
    logger.debug(`Hybrid search - vector weight: ${vectorWeight}, text weight: ${textWeight}`);

    // Server-side hybrid via Query API (dense + BM25 sparse, fused in Qdrant)
    // for migrated collections. Legacy client-side scroll fusion remains the
    // fallback for collections that don't declare the sparse vector yet.
    //
    // HYBRID_SERVER_SIDE_ENABLED=false routes every collection back to the
    // legacy path WITHOUT touching Qdrant — the rollback that needs no
    // migration (#3118). The short-circuit order matters: with the switch off
    // the getCollection round trip falls away too, and `collectionSupportsBm25`
    // never writes its process-wide cache entry (batchOperations.ts:34).
    if (hybridCfg.serverSideEnabled && (await collectionSupportsBm25(client, collection))) {
      const serverResult = await hybridSearchServerSide(
        client,
        collection,
        queryVector,
        query,
        filter,
        {
          limit,
          threshold,
          recallLimit: recallLimit ?? null,
          sparseQueryVector: options.sparseQueryVector ?? null,
        },
        hybridCfg
      );
      if (serverResult) return serverResult;
      logger.debug('Server-side hybrid unavailable for this query - using legacy fusion');
    }

    const recallText = Math.max(limit, recallLimit || limit * 4);
    const textResults = await performTextSearch(client, collection, query, filter, recallText);

    const dynamicThreshold = hybridCfg.enableDynamicThresholds
      ? calculateDynamicThreshold(threshold, textResults.length > 0, hybridCfg)
      : threshold;

    logger.debug(
      `Using dynamic threshold: ${dynamicThreshold} (text matches: ${textResults.length})`
    );

    const recallVec = Math.max(limit, Math.round((recallLimit || limit * 4) * 1.5));
    const vectorResults = await vectorSearch(client, collection, queryVector, filter, {
      limit: recallVec,
      threshold: dynamicThreshold,
      withPayload: true,
      ef: Math.max(100, recallVec * 2),
    });

    logger.info(`Vector: ${vectorResults.length} results, Text: ${textResults.length} results`);

    let shouldUseRRF = useRRF;
    let vW = vectorWeight;
    let tW = textWeight;

    const hasRealTextMatches = textResults.some(
      (r) => r.matchType && r.matchType !== 'token_fallback'
    );

    if (!hasRealTextMatches && textResults.length > 0 && useRRF) {
      logger.debug(
        `Only token fallback matches found (${textResults.length} results) - switching from RRF to weighted fusion`
      );
      shouldUseRRF = false;
      vW = 0.85;
      tW = 0.15;
    } else if (textResults.length === 0 && useRRF) {
      logger.debug('Text search failed (0 results) - switching from RRF to weighted fusion');
      shouldUseRRF = false;
      vW = 0.85;
      tW = 0.15;
    } else if (useRRF && textResults.length < 3) {
      logger.debug(
        `Too few text results (${textResults.length}) for effective RRF - switching to weighted fusion`
      );
      shouldUseRRF = false;
      vW = 0.85;
      tW = 0.15;
    } else if (!useRRF) {
      if (textResults.length === 0 || !hasRealTextMatches) {
        vW = 0.85;
        tW = 0.15;
      } else {
        vW = 0.5;
        tW = 0.5;
      }
      logger.debug(`Dynamic weights applied: vectorWeight=${vW}, textWeight=${tW}`);
    }

    let combinedResults = shouldUseRRF
      ? applyReciprocalRankFusion(vectorResults, textResults, limit, rrfK, hybridCfg)
      : applyWeightedCombination(vectorResults, textResults, vW, tW, limit);

    if (hybridCfg.enableQualityGate) {
      combinedResults = applyQualityGate(combinedResults, textResults.length > 0, hybridCfg);
    }

    return {
      success: true,
      results: combinedResults,
      metadata: {
        vectorResults: vectorResults.length,
        textResults: textResults.length,
        fusionMethod: shouldUseRRF ? 'RRF' : 'weighted',
        vectorWeight: vW,
        textWeight: tW,
        dynamicThreshold,
        qualityFiltered: hybridCfg.enableQualityGate,
        autoSwitchedFromRRF: useRRF && !shouldUseRRF,
        hasRealTextMatches: hasRealTextMatches,
        textMatchTypes: Array.from(
          new Set(textResults.map((r) => r.matchType).filter(Boolean))
        ) as string[],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Hybrid search failed: ${message}`);
    throw new Error(`Hybrid search failed: ${message}`);
  }
}

/**
 * Server-side hybrid search: one Query API round trip with a dense and a BM25
 * sparse prefetch, fused in Qdrant. Replaces the client-side scroll+TF-heuristic
 * fusion for collections that declare the sparse vector.
 *
 * Which fusion runs is HYBRID_SERVER_FUSION (#3118). `rrf` is the shipped
 * state; `rrf_weighted` mirrors the legacy path (dense dominates, the keyword
 * lane only lifts) without mixing two incomparable score ranges; `dbsf`
 * normalizes each prefetch's distribution instead of only its ranks.
 *
 * Returns null when the query yields no sparse terms (stopwords only) so the
 * caller can fall back to the legacy path.
 */
async function hybridSearchServerSide(
  client: QdrantClient,
  collection: string,
  queryVector: number[],
  query: string,
  filter: QdrantFilter,
  opts: {
    limit: number;
    threshold: number;
    recallLimit: number | null;
    sparseQueryVector?: SparseVector | null | undefined;
  },
  hybridCfg: HybridConfig
): Promise<HybridSearchResponse | null> {
  // Ein mitgegebener Vektor ersetzt den Encoder vollständig — er stammt dann
  // aus einem anderen Stemmer und passt zu einer anderen Sammlung (#3188).
  const sparseQuery = opts.sparseQueryVector ?? encodeBm25Query(query);
  if (sparseQuery.indices.length === 0) return null;

  const { limit, threshold, recallLimit } = opts;
  const recall = Math.max(limit, recallLimit || limit * 4);
  const hasFilter = Boolean(filter.must?.length || filter.should?.length || filter.must_not);
  const prefetchFilter = hasFilter ? (filter as Schemas['Filter']) : undefined;

  // Nur die dichte Vorabholung trägt eine Schwelle (`score_threshold`), die
  // sparse ist immer voll besetzt. Der Faktor ist der Regler auf genau diese
  // Asymmetrie: #3118 schlug eine grössere Sparse-Vorabholung vor, und als
  // Regler ist der Vorschlag in JEDEM Arm messbar, nicht nur in `rrf`.
  const sparseLimit = Math.round(recall * hybridCfg.serverSparseFactor);

  const densePrefetch: Schemas['Prefetch'] = {
    query: queryVector,
    using: '',
    limit: recall,
    score_threshold: threshold,
    params: { hnsw_ef: Math.max(100, recall * 2) },
    ...(prefetchFilter && { filter: prefetchFilter }),
  };

  const sparsePrefetch: Schemas['Prefetch'] = {
    query: { indices: sparseQuery.indices, values: sparseQuery.values },
    using: BM25_SPARSE_VECTOR_NAME,
    limit: sparseLimit,
    ...(prefetchFilter && { filter: prefetchFilter }),
  };

  const fusion = hybridCfg.serverFusion;
  const useSparse = sparseLimit >= 1;

  // Vorabholungen und Gewichte entstehen PAARWEISE: der Client verlangt „the
  // number of weights should match the number of prefetches"
  // (generated_schema.d.ts:3652). Zwei getrennt gepflegte Listen wären genau
  // die Stelle, an der ein weggelassener Prefetch die Gewichte verschiebt,
  // ohne dass irgendwo ein Fehler entsteht.
  const prefetches: Schemas['Prefetch'][] = [densePrefetch];
  const weights: number[] = [hybridCfg.serverRrfWeightDense];
  if (useSparse) {
    prefetches.push(sparsePrefetch);
    weights.push(1 - hybridCfg.serverRrfWeightDense);
  }

  // `sparse_only` ohne Sparse-Lane ist eine Abfrage ohne jede Lane. Derselbe
  // Rückfall wie bei einer stoppwortfreien Anfrage (:200-201): der Aufrufer
  // nimmt die Alt-Fusion, statt einen Rundlauf für nichts zu bezahlen.
  if (fusion === 'sparse_only' && !useSparse) return null;

  const request: Schemas['QueryRequest'] =
    fusion === 'sparse_only'
      ? {
          // Keine Fusion: die BM25-Lane allein. Diagnosearm — der score ist ein
          // BM25-Wert und keine Kosinus-Ähnlichkeit, und alles hinter
          // `searchOperations.ts` rechnet in Kosinus weiter. `limit` ist
          // `sparseLimit`, nicht `recall` — sonst wäre HYBRID_SERVER_SPARSE_FACTOR
          // auf diesem Arm ein stiller no-op (der Faktor-0-Kurzschluss oben
          // greift vorher, `sparseLimit` ist hier also immer ≥ 1).
          query: { indices: sparseQuery.indices, values: sparseQuery.values },
          using: BM25_SPARSE_VECTOR_NAME,
          limit: sparseLimit,
          with_payload: true,
          ...(prefetchFilter && { filter: prefetchFilter }),
        }
      : fusion === 'dense_rescore'
        ? {
            // Zweistufig: innen liefern beide Lanes die Kandidaten, aussen
            // sortiert der dichte Vektor sie — der zurückgegebene score ist
            // damit wieder ein Kosinus. Kein `score_threshold` und keine
            // `params` auf der äusseren Abfrage: `params` gilt laut Schema
            // „for when there is no prefetch", und eine zweite Schwelle wäre
            // ein neues Gatter. Die Schwelle bleibt auf der dichten
            // Vorabholung, wo sie heute steht.
            prefetch: [{ prefetch: prefetches, query: { fusion: 'rrf' }, limit: recall }],
            query: queryVector,
            using: '',
            limit: recall,
            with_payload: true,
          }
        : fusion === 'rrf_weighted'
          ? { prefetch: prefetches, query: { rrf: { weights } }, limit: recall, with_payload: true }
          : { prefetch: prefetches, query: { fusion }, limit: recall, with_payload: true };

  // Der Join spiegelt die beiden Vorabholungen als eigene Suchen im SELBEN
  // `queryBatch` (#3166): ein HTTP-Rundlauf, drei Abfragen
  // (qdrant-client.d.ts:895-899). Nur auf den fusionierenden Armen — bei
  // `dense_rescore` ist der äussere `score` schon der Kosinus, bei
  // `sparse_only` der BM25-Wert, dort wäre ein Batch ein Rundlauf für nichts.
  const joinOn = hybridCfg.serverScoreJoin;
  const useBatch = joinOn && (fusion === 'rrf' || fusion === 'rrf_weighted' || fusion === 'dbsf');

  const denseById = new Map<string | number, number>();
  const textById = new Map<string | number, number>();
  let points: Schemas['ScoredPoint'][];

  if (useBatch) {
    // Aus den Vorabholungen SELBST gebaut, nicht daneben getippt: nur so kann
    // die Spiegelsuche nicht von der Vorabholung wegdriften — und nur dann ist
    // ein Fusionstreffer ohne Eintrag eine Aussage ("war nicht in der dichten
    // Kandidatenmenge") statt eines Messfehlers.
    const searches: Schemas['QueryRequest'][] = [
      request,
      { ...densePrefetch, with_payload: false },
    ];
    if (useSparse) searches.push({ ...sparsePrefetch, with_payload: false });

    const responses = await client.queryBatch(collection, { searches });
    points = responses[0]?.points ?? [];
    for (const point of responses[1]?.points ?? []) denseById.set(point.id, point.score);
    for (const point of responses[2]?.points ?? []) textById.set(point.id, point.score);
  } else {
    points = (await client.query(collection, request)).points;
  }

  // Qdrant's server-side RRF scores are HIGHER than the legacy client-side
  // 1/(60+rank) domain (measured: rank 1 in both lists ≈ 1.0), so the quality
  // gate's minFinalScore — tuned for the lower legacy domain — only ever
  // filters less there, never more. That measurement covers `rrf` ONLY: DBSF
  // normalises each prefetch's distribution and bottoms out near 0, and
  // `sparse_only` returns raw BM25 scores, a different domain again. Both can
  // be cut where `rrf` is not — this gate has not been shown safe for them.
  const denseFromScore = joinOn && fusion === 'dense_rescore';
  const textFromScore = joinOn && fusion === 'sparse_only';

  let results: HybridSearchResult[] = points.map((point) => ({
    id: point.id,
    score: point.score,
    payload: (point.payload as Record<string, unknown>) || {},
    searchMethod: 'hybrid' as const,
    originalVectorScore: denseFromScore ? point.score : (denseById.get(point.id) ?? null),
    originalTextScore: textFromScore ? point.score : (textById.get(point.id) ?? null),
  }));

  // Until the gate has a score-domain-aware cut, it runs only on the arms whose
  // domain it was measured against: the rank-based rrf family and
  // dense_rescore, whose outer query returns the dense cosine. dbsf and
  // sparse_only would be cut in a domain nobody has measured. Der Join ändert
  // daran nichts: applyQualityGate prüft `result.score`, den Fusionswert.
  const gateMeasuredForArm = fusion !== 'dbsf' && fusion !== 'sparse_only';
  if (hybridCfg.enableQualityGate && gateMeasuredForArm) {
    results = applyQualityGate(results, true, hybridCfg);
  }
  results = results.slice(0, limit);

  // Der Deckungsgrad ist die Zahl, die dieser Entwurf schuldet: wie viele
  // Fusionstreffer bekommen überhaupt einen Kosinus? Vermutet werden darf sie
  // nicht — sie steht in jeder Anfrage im Log und im PR.
  const sparseCoverage = useSparse
    ? `, sparse join ${points.filter((p) => textById.has(p.id)).length}/${points.length}`
    : ', sparse join skipped';
  const joinCoverage = useBatch
    ? `, dense join ${points.filter((p) => denseById.has(p.id)).length}/${points.length}` +
      sparseCoverage
    : '';

  logger.info(
    `Server-side hybrid (${fusion}): ${results.length}/${points.length} results${joinCoverage} for "${query}"`
  );

  return {
    success: true,
    results,
    metadata: {
      vectorResults: -1,
      textResults: -1,
      fusionMethod: `${fusion}-server`,
      vectorWeight: fusion === 'rrf_weighted' ? hybridCfg.serverRrfWeightDense : 0.5,
      textWeight: fusion === 'rrf_weighted' ? 1 - hybridCfg.serverRrfWeightDense : 0.5,
      dynamicThreshold: threshold,
      qualityFiltered: hybridCfg.enableQualityGate,
      autoSwitchedFromRRF: false,
      // Factor 0 drops the sparse prefetch entirely (`useSparse`, :243) — a
      // dense-only request has no BM25 lane, so these must not claim one.
      //
      // Mit dem Sparse-Join (#3166) ist die ehrliche Antwort schärfer: nicht
      // "Lane vorhanden", sondern "Lane hat getroffen". Ohne Join bleibt es
      // bei der Lane — mehr weiss der Pfad dort nicht. `textMatchTypes` folgt
      // bewusst NICHT: welcher Matcher in der Lane läuft, ist eine Eigenschaft
      // der Lane und keine Aussage über diesen einen Treffer.
      hasRealTextMatches: useBatch ? textById.size > 0 : useSparse,
      textMatchTypes: useSparse ? ['bm25'] : [],
    },
  };
}

/**
 * Perform text-based search using Qdrant's scroll API with multi-variant support
 */
export async function performTextSearch(
  client: QdrantClient,
  collection: string,
  searchTerm: string,
  baseFilter: QdrantFilter = {},
  limit: number = 10
): Promise<TextSearchResult[]> {
  try {
    logger.debug(`Text search: "${searchTerm}" in collection "${collection}"`);

    const variants = generateQueryVariants(searchTerm);
    logger.debug(`Generated ${variants.length} query variants: ${variants.join(', ')}`);

    const variantSearchPromises = variants.map(async (variant): Promise<VariantSearchResult> => {
      const textFilter: QdrantFilter = {
        must: [...(baseFilter.must || [])],
      };
      textFilter.must!.push({
        key: 'chunk_text',
        match: { text: variant },
      });

      try {
        const scrollResult = await client.scroll(collection, {
          filter: textFilter as Schemas['Filter'],
          limit: Math.ceil(limit / variants.length) + 5,
          with_payload: true,
          with_vector: false,
        });
        return {
          variant,
          points: (scrollResult.points || []).map((p) => ({
            id: p.id,
            payload: (p.payload as Record<string, unknown>) || {},
          })),
          matchType: variant === searchTerm.toLowerCase() ? 'exact' : 'variant',
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Variant search failed for "${variant}": ${message}`);
        return { variant, points: [], matchType: 'error' };
      }
    });

    const variantResults = await Promise.all(variantSearchPromises);

    const seen = new Map<
      string | number,
      {
        point: { id: string | number; payload: Record<string, unknown> };
        variant: string;
        matchType: string;
      }
    >();
    let bestMatchType = 'variant';

    for (const result of variantResults) {
      if (result.points.length > 0 && result.matchType === 'exact') {
        bestMatchType = 'exact';
      }
      for (const point of result.points) {
        if (!seen.has(point.id)) {
          seen.set(point.id, { point, variant: result.variant, matchType: result.matchType });
        }
      }
    }

    let mergedPoints = Array.from(seen.values());
    let matchType = mergedPoints.length > 0 ? bestMatchType : 'none';

    logger.debug(
      `Variant search found ${mergedPoints.length} unique points from ${variants.length} variants`
    );

    // Token fallback if no results
    if (mergedPoints.length === 0) {
      const normalizedTerm = normalizeQuery(searchTerm);
      const tokens = tokenizeQuery(normalizedTerm || searchTerm).filter((t) => t.length >= 4);
      if (tokens.length > 1) {
        logger.debug(`Token fallback for terms: ${tokens.join(', ')}`);
        const tokenSearchPromises = tokens.map(async (tok) => {
          const tokFilter: QdrantFilter = { must: [...(baseFilter.must || [])] };
          tokFilter.must!.push({ key: 'chunk_text', match: { text: tok } });
          try {
            const tokRes = await client.scroll(collection, {
              filter: tokFilter as Schemas['Filter'],
              limit: Math.ceil(limit / tokens.length) + 3,
              with_payload: true,
              with_vector: false,
            });
            return (tokRes.points || []).map((p) => ({
              id: p.id,
              payload: (p.payload as Record<string, unknown>) || {},
            }));
          } catch {
            return [];
          }
        });

        const tokenResults = await Promise.all(tokenSearchPromises);
        const tokenSeen = new Map<
          string | number,
          {
            point: { id: string | number; payload: Record<string, unknown> };
            variant: string;
            matchType: string;
          }
        >();
        for (const points of tokenResults) {
          for (const p of points) {
            if (!tokenSeen.has(p.id)) {
              tokenSeen.set(p.id, { point: p, variant: 'token', matchType: 'token_fallback' });
            }
          }
        }
        mergedPoints = Array.from(tokenSeen.values());
        if (mergedPoints.length > 0) matchType = 'token_fallback';
        logger.debug(`Token OR fallback found: ${mergedPoints.length} unique points`);
      }
    }

    if (mergedPoints.length > 0) {
      logger.debug(`Text search matches found: ${mergedPoints.length}`);
    } else {
      logger.debug(`No text matches found for "${searchTerm}"`);
    }

    const results: TextSearchResult[] = mergedPoints.map(({ point, variant }) => ({
      id: point.id,
      score: calculateTextSearchScore(searchTerm, point.payload.chunk_text as string),
      payload: point.payload,
      searchMethod: 'text' as const,
      searchTerm: searchTerm,
      matchedVariant: variant,
      matchType: matchType as TextSearchResult['matchType'],
    }));

    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, limit);

    logger.debug(
      `Text search returning ${limitedResults.length} processed results (matchType: ${matchType})`
    );
    return limitedResults;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Text search failed for "${searchTerm}": ${message}`);
    return [];
  }
}

/**
 * Score a keyword hit by how often the term occurs in the chunk.
 *
 * There used to be a position penalty here (`1 - position * 0.1`), but
 * `position` is the index in the `client.scroll` output — Qdrant returns those
 * in point-id order, which carries no relevance at all. With a recall window in
 * the hundreds every hit past the ninth was multiplied by the 0.1 floor, so
 * term frequency was erased for all but a handful of arbitrarily chosen chunks
 * and every keyword hit scored the same 0.1.
 */
export function calculateTextSearchScore(searchTerm: string, text: string | undefined): number {
  if (!text || !searchTerm) return TEXT_SCORE_FLOOR;

  const lowerText = text.toLowerCase();
  const lowerTerm = searchTerm.toLowerCase();

  const matches = (
    lowerText.match(new RegExp(lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
  ).length;
  let score = Math.min(matches * TEXT_SCORE_PER_MATCH, TEXT_SCORE_MAX);

  // Short terms match by accident far more often than long ones, so they are
  // allowed to contribute less.
  score *= Math.min(1, searchTerm.length / 10);

  return Math.min(1.0, Math.max(TEXT_SCORE_FLOOR, score));
}

/**
 * Calculate dynamic threshold based on text match presence
 */
export function calculateDynamicThreshold(
  baseThreshold: number,
  hasTextMatches: boolean,
  hybridCfg: HybridConfig
): number {
  if (!hybridCfg.enableDynamicThresholds) {
    return baseThreshold;
  }

  if (hasTextMatches) {
    return Math.max(baseThreshold, hybridCfg.minVectorWithTextThreshold);
  } else {
    return Math.max(baseThreshold, hybridCfg.minVectorOnlyThreshold);
  }
}

/**
 * Apply Reciprocal Rank Fusion to combine vector and text results
 */
export function applyReciprocalRankFusion(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  limit: number,
  k: number = 60,
  hybridCfg: HybridConfig
): HybridSearchResult[] {
  const scoresMap = new Map<string | number, RRFScoringItem>();

  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scoresMap.set(result.id, {
      item: result,
      rrfScore: rrfScore,
      vectorRank: index + 1,
      textRank: null,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector',
      confidence: hybridCfg.enableConfidenceWeighting ? hybridCfg.confidencePenalty : 1.0,
    });
  });

  textResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    const key = result.id;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key)!;
      existing.rrfScore += rrfScore;
      existing.textRank = index + 1;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
      existing.confidence = hybridCfg.enableConfidenceWeighting ? hybridCfg.confidenceBoost : 1.0;
    } else {
      scoresMap.set(key, {
        item: result,
        rrfScore: rrfScore,
        vectorRank: null,
        textRank: index + 1,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
        confidence: 1.0,
      });
    }
  });

  return Array.from(scoresMap.values())
    .map((result) => ({
      ...result,
      finalScore: result.rrfScore * result.confidence,
    }))
    .sort((a, b) => b.finalScore! - a.finalScore!)
    .slice(0, limit)
    .map((result) => ({
      id: result.item.id,
      score: result.finalScore!,
      payload: result.item.payload,
      searchMethod: result.searchMethod,
      originalVectorScore: result.originalVectorScore,
      originalTextScore: result.originalTextScore,
      confidence: result.confidence,
      rawRRFScore: result.rrfScore,
    }));
}

/**
 * Apply weighted combination to merge vector and text results.
 *
 * A chunk that only the vector lane found is scored on the vector weight ALONE
 * (weighted average), not on the full weight sum. Otherwise its score is scaled
 * down by the missing text weight and it has to clear the caller's threshold
 * from behind a handicap that varies with the query's wording — with
 * `vectorWeight` 0.5 a threshold of 0.35 silently means cosine 0.70, with 0.85
 * it means cosine 0.41. Same chunk, same collection, different phrasing.
 *
 * The asymmetry with text-only chunks (still scaled by the text weight) is
 * deliberate: the two absences carry different information. The vector lane
 * ranks the whole collection, so a missing text hit only means the chunk lacks
 * the literal term — no evidence against it. The text lane is a filter, so a
 * missing vector hit means the chunk WAS scored and fell below the threshold —
 * that is evidence against it, and keeps its penalty.
 */
export function applyWeightedCombination(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  vectorWeight: number,
  textWeight: number,
  limit: number
): HybridSearchResult[] {
  const scoresMap = new Map<string | number, WeightedScoringItem>();

  const totalWeight = vectorWeight + textWeight;
  const normalizedVectorWeight = vectorWeight / totalWeight;
  const normalizedTextWeight = textWeight / totalWeight;

  vectorResults.forEach((result) => {
    scoresMap.set(result.id, {
      item: result,
      vectorScore: result.score * normalizedVectorWeight,
      textScore: 0,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector',
    });
  });

  textResults.forEach((result) => {
    const key = result.id;
    const textScore = result.score * normalizedTextWeight;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key)!;
      existing.textScore = textScore;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
    } else {
      scoresMap.set(key, {
        item: result,
        vectorScore: 0,
        textScore: textScore,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
      });
    }
  });

  return Array.from(scoresMap.values())
    .map((result) => {
      const hasVector = result.originalVectorScore !== null;
      const hasText = result.originalTextScore !== null;
      // Divide by the weight of the lanes that actually contributed, so a
      // vector-only hit keeps its cosine instead of being scaled by a weight
      // that the caller's threshold knows nothing about.
      const contributingWeight =
        hasVector && !hasText
          ? normalizedVectorWeight
          : normalizedVectorWeight + normalizedTextWeight;

      const blended = (result.vectorScore + result.textScore) / (contributingWeight || 1);

      // Finding the query term is evidence FOR a chunk, so it may only ever
      // raise the score. Blending alone inverted the ranking: a chunk matched
      // by both lanes was pulled toward the lower text score, while a chunk
      // the keyword lane never saw kept its full cosine — so documents that
      // literally contain the search term ranked below ones that merely sit
      // near it in embedding space, and often fell out of the result window
      // entirely.
      const score =
        hasVector && hasText ? Math.max(result.originalVectorScore as number, blended) : blended;

      return {
        id: result.item.id,
        score,
        payload: result.item.payload,
        searchMethod: result.searchMethod,
        originalVectorScore: result.originalVectorScore,
        originalTextScore: result.originalTextScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Apply quality gate to filter out low-quality results after fusion
 */
export function applyQualityGate(
  results: HybridSearchResult[],
  hasTextMatches: boolean,
  hybridCfg: HybridConfig
): HybridSearchResult[] {
  if (!hybridCfg.enableQualityGate || !results || results.length === 0) {
    return results;
  }

  logger.debug(
    `Quality gate: filtering ${results.length} results (hasTextMatches: ${hasTextMatches})`
  );

  if (results.length > 0) {
    const scores = results.map((r) => r.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    logger.debug(
      `Score distribution: min=${minScore.toFixed(6)}, max=${maxScore.toFixed(6)}, avg=${avgScore.toFixed(6)}`
    );
  }

  const filteredResults = results.filter((result) => {
    if (result.score < hybridCfg.minFinalScore) {
      return false;
    }

    if (result.searchMethod === 'vector' && !hasTextMatches) {
      if (result.score < hybridCfg.minVectorOnlyFinalScore) {
        return false;
      }
    }

    return true;
  });

  const removedCount = results.length - filteredResults.length;
  logger.debug(
    `Quality gate: kept ${filteredResults.length}/${results.length}${removedCount > 0 ? `, removed ${removedCount}` : ''}`
  );

  return filteredResults;
}
