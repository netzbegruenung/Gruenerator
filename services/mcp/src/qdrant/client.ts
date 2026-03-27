import {
  applyReciprocalRankFusion,
  applyWeightedCombination,
  applyQualityGate,
  calculateTextSearchScore,
  DEFAULT_HYBRID_CONFIG,
} from '@gruenerator/shared/search/vector';
import { type VectorSearchResult, type TextSearchResult } from '@gruenerator/shared/search/vector';
import { generateQueryVariants, tokenizeQuery, normalizeQuery } from '@gruenerator/shared/utils';
import { QdrantClient } from '@qdrant/js-client-rest';

import { config } from '../config.ts';

let client: QdrantClient | null = null;

// Use shared hybrid config with MCP-specific overrides
const hybridConfig = {
  ...DEFAULT_HYBRID_CONFIG,
  minFinalScore: 0.01,
  minVectorOnlyFinalScore: 0.02,
  confidenceBoost: 1.1,
  confidencePenalty: 0.9,
};

export async function getQdrantClient(): Promise<QdrantClient> {
  if (client) {
    return client;
  }

  const url = new URL(config.qdrant.url!);

  const clientConfig: Record<string, unknown> = {
    host: url.hostname,
    port: url.port ? parseInt(url.port) : url.protocol === 'https:' ? 443 : 80,
    https: url.protocol === 'https:',
    apiKey: config.qdrant.apiKey,
    timeout: 30000,
  };

  if (config.qdrant.basicAuth?.username && config.qdrant.basicAuth?.password) {
    const basicAuth = Buffer.from(
      `${config.qdrant.basicAuth.username}:${config.qdrant.basicAuth.password}`
    ).toString('base64');
    clientConfig.headers = {
      Authorization: `Basic ${basicAuth}`,
    };
  }

  client = new QdrantClient(clientConfig);

  try {
    await client.getCollections();
    console.error('[Qdrant] Verbindung hergestellt');
  } catch (err) {
    console.error('[Qdrant] Verbindungsfehler:', err instanceof Error ? err.message : String(err));
    throw err;
  }

  return client;
}

/**
 * Merge base filter with additional filter
 */
interface QdrantFilter {
  must?: unknown[];
}

function mergeFilters(
  baseFilter: QdrantFilter | null | undefined,
  additionalFilter: QdrantFilter | null | undefined
): QdrantFilter | undefined {
  if (!additionalFilter) return baseFilter ?? undefined;
  if (!baseFilter) return additionalFilter;

  const must = [...(baseFilter.must || []), ...(additionalFilter.must || [])];

  return must.length > 0 ? { must } : undefined;
}

/**
 * Vector similarity search
 */
export async function searchCollection(
  collectionName: string,
  embedding: number[],
  limit = 5,
  filter: Record<string, unknown> | null = null
) {
  const qdrant = await getQdrantClient();

  const results = await qdrant.search(collectionName, {
    vector: embedding,
    limit: limit,
    with_payload: true,
    ...(filter ? { filter: filter as Record<string, unknown> } : {}),
  });

  return results.map((hit) => {
    const payload = hit.payload as Record<string, unknown> | undefined;
    const metadata = payload?.metadata as Record<string, unknown> | undefined;
    return {
      score: hit.score,
      title: String(payload?.title || metadata?.title || 'Unbekannt'),
      text: String(payload?.chunk_text || ''),
      url: (payload?.url || payload?.source_url || metadata?.url || null) as string | null,
      documentId: payload?.document_id as string | undefined,
      filename: payload?.filename || metadata?.filename,
      qualityScore: payload?.quality_score as number | undefined,
      payload,
    };
  });
}

/**
 * Text search using Qdrant's scroll API with query variants
 */
async function performTextSearch(
  collectionName: string,
  searchTerm: string,
  limit = 10,
  baseFilter: QdrantFilter | Record<string, unknown> | null = null
) {
  const qdrant = await getQdrantClient();

  const variants = generateQueryVariants(searchTerm);
  console.error(`[TextSearch] Generated ${variants.length} query variants`);

  const variantSearchPromises = variants.map(async (variant) => {
    try {
      const textFilter = {
        must: [{ key: 'chunk_text', match: { text: variant } }],
      };
      const combinedFilter = mergeFilters(textFilter, baseFilter as QdrantFilter | null);

      const scrollResult = await qdrant.scroll(collectionName, {
        filter: combinedFilter as Record<string, unknown> | undefined,
        limit: Math.ceil(limit / variants.length) + 5,
        with_payload: true,
        with_vector: false,
      });
      return {
        variant,
        points: scrollResult.points || [],
        matchType: variant === searchTerm.toLowerCase() ? 'exact' : 'variant',
      };
    } catch (err) {
      console.error(
        `[TextSearch] Variant "${variant}" failed:`,
        err instanceof Error ? err.message : String(err)
      );
      return { variant, points: [], matchType: 'error' };
    }
  });

  const variantResults = await Promise.all(variantSearchPromises);

  // Merge and deduplicate
  const seen = new Map();
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

  // Token fallback if no results
  if (mergedPoints.length === 0) {
    const normalizedTerm = normalizeQuery(searchTerm);
    const tokens = tokenizeQuery(normalizedTerm || searchTerm).filter((t) => t.length >= 4);

    if (tokens.length > 1) {
      console.error(`[TextSearch] Token fallback for: ${tokens.join(', ')}`);

      const tokenSearchPromises = tokens.map(async (tok) => {
        try {
          const tokenFilter = { must: [{ key: 'chunk_text', match: { text: tok } }] };
          const combinedFilter = mergeFilters(tokenFilter, baseFilter as QdrantFilter | null);

          const tokRes = await qdrant.scroll(collectionName, {
            filter: combinedFilter as Record<string, unknown> | undefined,
            limit: Math.ceil(limit / tokens.length) + 3,
            with_payload: true,
            with_vector: false,
          });
          return tokRes.points || [];
        } catch {
          return [];
        }
      });

      const tokenResults = await Promise.all(tokenSearchPromises);
      const tokenSeen = new Map();

      for (const points of tokenResults) {
        for (const p of points) {
          if (!tokenSeen.has(p.id)) {
            tokenSeen.set(p.id, { point: p, variant: 'token', matchType: 'token_fallback' });
          }
        }
      }

      mergedPoints = Array.from(tokenSeen.values());
      if (mergedPoints.length > 0) matchType = 'token_fallback';
    }
  }

  console.error(
    `[TextSearch] Found ${mergedPoints.length} unique results (matchType: ${matchType})`
  );

  return mergedPoints.map(({ point }, index) => {
    const payload = point.payload as Record<string, unknown> | undefined;
    return {
      id: point.id,
      score: calculateTextSearchScore(searchTerm, payload?.chunk_text as string | undefined, index),
      payload,
      matchType,
    };
  });
}

// calculateTextSearchScore is imported from @gruenerator/shared

/**
 * Apply Reciprocal Rank Fusion - uses shared implementation
 */
function applyRRF(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  limit: number,
  k = 60
) {
  return applyReciprocalRankFusion(vectorResults, textResults, limit, k, hybridConfig);
}

/**
 * Apply weighted combination - uses shared implementation
 */
function applyWeightedCombinationLocal(
  vectorResults: VectorSearchResult[],
  textResults: TextSearchResult[],
  vectorWeight: number,
  textWeight: number,
  limit: number
) {
  return applyWeightedCombination(vectorResults, textResults, vectorWeight, textWeight, limit);
}

/**
 * Apply quality gate filtering - uses shared implementation
 */
function applyQualityGateLocal(results: VectorSearchResult[], hasTextMatches: boolean) {
  return applyQualityGate(results, hasTextMatches, hybridConfig);
}

/**
 * Hybrid search combining vector and text search
 */
export async function hybridSearchCollection(
  collectionName: string,
  embedding: number[],
  query: string,
  limit = 5,
  options: Record<string, unknown> = {}
) {
  const {
    vectorWeight = 0.7,
    textWeight = 0.3,
    useRRF = true,
    rrfK = 60,
    filter = null,
  } = options as {
    vectorWeight?: number;
    textWeight?: number;
    useRRF?: boolean;
    rrfK?: number;
    filter?: Record<string, unknown> | null;
  };

  const qdrant = await getQdrantClient();

  console.error(`[HybridSearch] Starting hybrid search in ${collectionName}`);

  // Run text search first for dynamic threshold
  const textLimit = limit * 4;
  const textResults = await performTextSearch(collectionName, query, textLimit, filter);

  // Calculate dynamic threshold
  const hasTextMatches = textResults.some((r) => r.matchType && r.matchType !== 'token_fallback');
  const threshold = hybridConfig.enableDynamicThresholds
    ? hasTextMatches
      ? hybridConfig.minVectorWithTextThreshold
      : hybridConfig.minVectorOnlyThreshold
    : 0.3;

  console.error(
    `[HybridSearch] Dynamic threshold: ${threshold} (hasTextMatches: ${hasTextMatches})`
  );

  // Vector search
  const vectorLimit = limit * 6;

  const vectorResults = await qdrant.search(collectionName, {
    vector: embedding,
    limit: vectorLimit,
    score_threshold: threshold,
    with_payload: true,
    ...(filter ? { filter: filter as Record<string, unknown> } : {}),
  });

  const mappedVectorResults: VectorSearchResult[] = vectorResults.map((hit) => {
    const payload = (hit.payload ?? {}) as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown> | undefined;
    return {
      id: hit.id,
      score: hit.score,
      payload,
      title: (payload.title || metadata?.title || 'Unbekannt') as string,
      text: (payload.chunk_text || '') as string,
      url: (payload.url || payload.source_url || metadata?.url || null) as string | null,
      qualityScore: payload.quality_score as number | undefined,
    };
  });

  console.error(
    `[HybridSearch] Vector: ${mappedVectorResults.length}, Text: ${textResults.length}`
  );

  // Determine fusion method
  let shouldUseRRF = useRRF;
  let vW = vectorWeight;
  let tW = textWeight;

  if (!hasTextMatches && textResults.length > 0 && useRRF) {
    shouldUseRRF = false;
    vW = 0.85;
    tW = 0.15;
  } else if (textResults.length === 0 && useRRF) {
    shouldUseRRF = false;
    vW = 0.85;
    tW = 0.15;
  } else if (useRRF && textResults.length < 3) {
    shouldUseRRF = false;
    vW = 0.85;
    tW = 0.15;
  }

  // Apply fusion — cast textResults to shared TextSearchResult type
  const typedTextResults = textResults as unknown as TextSearchResult[];
  let combinedResults = shouldUseRRF
    ? applyRRF(mappedVectorResults, typedTextResults, limit * 2, rrfK)
    : applyWeightedCombinationLocal(mappedVectorResults, typedTextResults, vW, tW, limit * 2);

  // Apply quality gate
  combinedResults = applyQualityGateLocal(combinedResults, hasTextMatches);

  // Normalize RRF scores to vector similarity scale for meaningful display.
  // RRF produces scores ~0.01-0.04 (ranking-based), while vector scores are ~0.3-0.9
  // (cosine similarity). Without normalization, RRF results display as "2-4%" relevance.
  if (shouldUseRRF && combinedResults.length > 0 && mappedVectorResults.length > 0) {
    const topVectorScore = mappedVectorResults[0]!.score;
    const topRRFScore = combinedResults[0]!.score;
    if (topRRFScore > 0 && topRRFScore < 0.15) {
      const scaleFactor = topVectorScore / topRRFScore;
      combinedResults = combinedResults.map((r) => ({
        ...r,
        score: Math.min(r.score * scaleFactor, 1.0),
      }));
      console.error(
        `[HybridSearch] RRF score normalization: ${topRRFScore.toFixed(4)} → ${topVectorScore.toFixed(4)} (scale: ${scaleFactor.toFixed(1)}x)`
      );
    }
  }

  // Apply quality-weighted scoring
  const finalResults = combinedResults.slice(0, limit).map((result) => {
    const qualityScore = Number(result.qualityScore ?? result.payload?.quality_score ?? 1.0);
    const qualityBoost = 1 + (qualityScore - 0.5) * 0.4;

    return {
      score: Math.min(result.score * qualityBoost, 1.0),
      title: String(result.title || result.payload?.title || 'Unbekannt'),
      text: String(result.text || result.payload?.chunk_text || ''),
      url: (result.url ||
        result.payload?.url ||
        result.payload?.source_url ||
        (result.payload?.metadata as Record<string, unknown>)?.url ||
        null) as string | null,
      documentId: (result.documentId || result.payload?.document_id) as string | undefined,
      filename: result.filename || result.payload?.filename,
      searchMethod: result.searchMethod as string | undefined,
      qualityScore,
      payload: result.payload,
    };
  });

  console.error(
    `[HybridSearch] Returning ${finalResults.length} results (fusion: ${shouldUseRRF ? 'RRF' : 'weighted'})`
  );

  return {
    results: finalResults,
    metadata: {
      vectorResults: mappedVectorResults.length,
      textResults: textResults.length,
      fusionMethod: shouldUseRRF ? 'RRF' : 'weighted',
      hasTextMatches,
    },
  };
}

/**
 * Text-only search
 */
export async function textSearchCollection(
  collectionName: string,
  query: string,
  limit = 5,
  filter: Record<string, unknown> | null = null
) {
  const textResults = await performTextSearch(collectionName, query, limit * 2, filter);

  return textResults.slice(0, limit).map((result) => {
    const metadata = result.payload?.metadata as Record<string, unknown> | undefined;
    return {
      score: result.score,
      title: String(result.payload?.title || metadata?.title || 'Unbekannt'),
      text: String(result.payload?.chunk_text || ''),
      url: (result.payload?.url || result.payload?.source_url || metadata?.url || null) as
        | string
        | null,
      documentId: result.payload?.document_id as string | undefined,
      filename: result.payload?.filename || metadata?.filename,
      searchMethod: 'text' as const,
      matchType: result.matchType,
      payload: result.payload,
    };
  });
}

export async function getCollectionInfo(collectionName: string) {
  const qdrant = await getQdrantClient();

  try {
    const collectionInfo = await qdrant.getCollection(collectionName);
    return {
      name: collectionName,
      pointsCount: collectionInfo.points_count,
      status: collectionInfo.status,
    };
  } catch (err) {
    return {
      name: collectionName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get unique values for a specific field in a collection
 * Used for filter discovery - returns all distinct values for a given field
 */
async function _getUniqueFieldValues(collectionName: string, fieldName: string, limit = 100) {
  const qdrant = await getQdrantClient();

  try {
    const scrollResult = await qdrant.scroll(collectionName, {
      limit: 1000,
      with_payload: { include: [fieldName] },
      with_vector: false,
    });

    const values = new Set();
    for (const point of scrollResult.points || []) {
      const value = point.payload?.[fieldName];
      if (value !== undefined && value !== null && value !== '') {
        values.add(value);
      }
    }

    const sortedValues = Array.from(values).sort((a, b) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b, 'de');
      }
      return String(a).localeCompare(String(b));
    });

    return sortedValues.slice(0, limit);
  } catch (err) {
    console.error(
      `[Qdrant] Error fetching unique values for ${fieldName}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

/**
 * Get unique field values with document counts (faceted search)
 * Returns values sorted by count (most common first)
 */
export async function getFieldValueCounts(
  collectionName: string,
  fieldName: string,
  maxValues = 50,
  baseFilter: Record<string, unknown> | null = null
) {
  const qdrant = await getQdrantClient();

  try {
    const valueCounts = new Map();
    let offset = null;
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      const scrollOptions: Record<string, unknown> = {
        limit: 100,
        offset: offset,
        with_payload: { include: [fieldName] },
        with_vector: false,
      };

      if (baseFilter) {
        scrollOptions.filter = baseFilter;
      }

      const scrollResult = await qdrant.scroll(collectionName, scrollOptions);

      if (!scrollResult.points?.length) break;

      for (const point of scrollResult.points) {
        const value = point.payload?.[fieldName];
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            for (const v of value) {
              if (v) valueCounts.set(String(v), (valueCounts.get(String(v)) || 0) + 1);
            }
          } else {
            valueCounts.set(String(value), (valueCounts.get(String(value)) || 0) + 1);
          }
        }
      }

      offset = scrollResult.next_page_offset;
      if (!offset) break;
      iterations++;
    }

    return [...valueCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxValues);
  } catch (err) {
    console.error(
      `[Qdrant] Error fetching value counts for ${fieldName}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}
