import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { generateQueryVariants, tokenizeQuery, normalizeQuery } from '@gruenerator/shared/utils';

let client = null;

// Hybrid search configuration
const hybridConfig = {
  enableDynamicThresholds: true,
  enableQualityGate: true,
  enableConfidenceWeighting: true,
  minVectorWithTextThreshold: 0.3,
  minVectorOnlyThreshold: 0.5,
  minFinalScore: 0.01,
  minVectorOnlyFinalScore: 0.02,
  confidenceBoost: 1.1,
  confidencePenalty: 0.9
};

export async function getQdrantClient() {
  if (client) {
    return client;
  }

  const url = new URL(config.qdrant.url);

  const clientConfig = {
    host: url.hostname,
    port: url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80),
    https: url.protocol === 'https:',
    apiKey: config.qdrant.apiKey,
    timeout: 30000
  };

  if (config.qdrant.basicAuth?.username && config.qdrant.basicAuth?.password) {
    const basicAuth = Buffer.from(
      `${config.qdrant.basicAuth.username}:${config.qdrant.basicAuth.password}`
    ).toString('base64');
    clientConfig.headers = {
      'Authorization': `Basic ${basicAuth}`
    };
  }

  client = new QdrantClient(clientConfig);

  try {
    await client.getCollections();
    console.error('[Qdrant] Verbindung hergestellt');
  } catch (error) {
    console.error('[Qdrant] Verbindungsfehler:', error.message);
    throw error;
  }

  return client;
}

/**
 * Merge base filter with additional filter
 */
function mergeFilters(baseFilter, additionalFilter) {
  if (!additionalFilter) return baseFilter;
  if (!baseFilter) return additionalFilter;

  const must = [
    ...(baseFilter.must || []),
    ...(additionalFilter.must || [])
  ];

  return must.length > 0 ? { must } : undefined;
}

/**
 * Vector similarity search
 */
export async function searchCollection(collectionName, embedding, limit = 5, filter = null) {
  const qdrant = await getQdrantClient();

  const searchParams = {
    vector: embedding,
    limit: limit,
    with_payload: true
  };

  if (filter) {
    searchParams.filter = filter;
  }

  const results = await qdrant.search(collectionName, searchParams);

  return results.map(hit => ({
    score: hit.score,
    title: hit.payload?.title || hit.payload?.metadata?.title || 'Unbekannt',
    text: hit.payload?.chunk_text || '',
    url: hit.payload?.url || hit.payload?.source_url || hit.payload?.metadata?.url || null,
    documentId: hit.payload?.document_id,
    filename: hit.payload?.filename || hit.payload?.metadata?.filename,
    qualityScore: hit.payload?.quality_score
  }));
}

/**
 * Text search using Qdrant's scroll API with query variants
 */
async function performTextSearch(collectionName, searchTerm, limit = 10, baseFilter = null) {
  const qdrant = await getQdrantClient();

  const variants = generateQueryVariants(searchTerm);
  console.error(`[TextSearch] Generated ${variants.length} query variants`);

  const variantSearchPromises = variants.map(async (variant) => {
    try {
      const textFilter = {
        must: [{ key: 'chunk_text', match: { text: variant } }]
      };
      const combinedFilter = mergeFilters(textFilter, baseFilter);

      const scrollResult = await qdrant.scroll(collectionName, {
        filter: combinedFilter,
        limit: Math.ceil(limit / variants.length) + 5,
        with_payload: true,
        with_vector: false
      });
      return {
        variant,
        points: scrollResult.points || [],
        matchType: variant === searchTerm.toLowerCase() ? 'exact' : 'variant'
      };
    } catch (err) {
      console.error(`[TextSearch] Variant "${variant}" failed:`, err.message);
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
    const tokens = tokenizeQuery(normalizedTerm || searchTerm).filter(t => t.length >= 4);

    if (tokens.length > 1) {
      console.error(`[TextSearch] Token fallback for: ${tokens.join(', ')}`);

      const tokenSearchPromises = tokens.map(async (tok) => {
        try {
          const tokenFilter = { must: [{ key: 'chunk_text', match: { text: tok } }] };
          const combinedFilter = mergeFilters(tokenFilter, baseFilter);

          const tokRes = await qdrant.scroll(collectionName, {
            filter: combinedFilter,
            limit: Math.ceil(limit / tokens.length) + 3,
            with_payload: true,
            with_vector: false
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

  console.error(`[TextSearch] Found ${mergedPoints.length} unique results (matchType: ${matchType})`);

  return mergedPoints.map(({ point }, index) => ({
    id: point.id,
    score: calculateTextSearchScore(searchTerm, point.payload?.chunk_text, index),
    payload: point.payload,
    matchType
  }));
}

/**
 * Calculate text search score
 */
function calculateTextSearchScore(searchTerm, text, position) {
  if (!text || !searchTerm) return 0.1;

  const lowerText = text.toLowerCase();
  const lowerTerm = searchTerm.toLowerCase();

  const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = (lowerText.match(new RegExp(escapedTerm, 'g')) || []).length;
  let score = Math.min(matches * 0.1, 0.8);

  const positionPenalty = Math.max(0.1, 1 - (position * 0.1));
  score *= positionPenalty;

  const lengthNormalization = Math.min(1, searchTerm.length / 10);
  score *= lengthNormalization;

  return Math.min(1.0, Math.max(0.1, score));
}

/**
 * Apply Reciprocal Rank Fusion
 */
function applyRRF(vectorResults, textResults, limit, k = 60) {
  const scoresMap = new Map();

  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    scoresMap.set(result.id, {
      item: result,
      rrfScore,
      vectorRank: index + 1,
      textRank: null,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector',
      confidence: hybridConfig.enableConfidenceWeighting ? hybridConfig.confidencePenalty : 1.0
    });
  });

  textResults.forEach((result, index) => {
    const rrfScore = 1 / (k + index + 1);
    const key = result.id;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key);
      existing.rrfScore += rrfScore;
      existing.textRank = index + 1;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
      existing.confidence = hybridConfig.enableConfidenceWeighting ? hybridConfig.confidenceBoost : 1.0;
    } else {
      scoresMap.set(key, {
        item: result,
        rrfScore,
        vectorRank: null,
        textRank: index + 1,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text',
        confidence: 1.0
      });
    }
  });

  return Array.from(scoresMap.values())
    .map(result => ({
      ...result,
      finalScore: result.rrfScore * result.confidence
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
    .map(result => ({
      ...result.item,
      score: result.finalScore,
      searchMethod: result.searchMethod,
      originalVectorScore: result.originalVectorScore,
      originalTextScore: result.originalTextScore
    }));
}

/**
 * Apply weighted combination
 */
function applyWeightedCombination(vectorResults, textResults, vectorWeight, textWeight, limit) {
  const scoresMap = new Map();
  const totalWeight = vectorWeight + textWeight;
  const normVW = vectorWeight / totalWeight;
  const normTW = textWeight / totalWeight;

  vectorResults.forEach(result => {
    scoresMap.set(result.id, {
      item: result,
      vectorScore: result.score * normVW,
      textScore: 0,
      originalVectorScore: result.score,
      originalTextScore: null,
      searchMethod: 'vector'
    });
  });

  textResults.forEach(result => {
    const key = result.id;
    const textScore = result.score * normTW;

    if (scoresMap.has(key)) {
      const existing = scoresMap.get(key);
      existing.textScore = textScore;
      existing.originalTextScore = result.score;
      existing.searchMethod = 'hybrid';
    } else {
      scoresMap.set(key, {
        item: result,
        vectorScore: 0,
        textScore,
        originalVectorScore: null,
        originalTextScore: result.score,
        searchMethod: 'text'
      });
    }
  });

  return Array.from(scoresMap.values())
    .map(result => ({
      ...result.item,
      score: result.vectorScore + result.textScore,
      searchMethod: result.searchMethod,
      originalVectorScore: result.originalVectorScore,
      originalTextScore: result.originalTextScore
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Apply quality gate filtering
 */
function applyQualityGate(results, hasTextMatches) {
  if (!hybridConfig.enableQualityGate || !results?.length) {
    return results;
  }

  return results.filter(result => {
    if (result.score < hybridConfig.minFinalScore) return false;
    if (result.searchMethod === 'vector' && !hasTextMatches) {
      if (result.score < hybridConfig.minVectorOnlyFinalScore) return false;
    }
    return true;
  });
}

/**
 * Hybrid search combining vector and text search
 */
export async function hybridSearchCollection(collectionName, embedding, query, limit = 5, options = {}) {
  const {
    vectorWeight = 0.7,
    textWeight = 0.3,
    useRRF = true,
    rrfK = 60,
    filter = null
  } = options;

  const qdrant = await getQdrantClient();

  console.error(`[HybridSearch] Starting hybrid search in ${collectionName}`);

  // Run text search first for dynamic threshold
  const textLimit = limit * 4;
  const textResults = await performTextSearch(collectionName, query, textLimit, filter);

  // Calculate dynamic threshold
  const hasTextMatches = textResults.some(r => r.matchType && r.matchType !== 'token_fallback');
  const threshold = hybridConfig.enableDynamicThresholds
    ? (hasTextMatches ? hybridConfig.minVectorWithTextThreshold : hybridConfig.minVectorOnlyThreshold)
    : 0.3;

  console.error(`[HybridSearch] Dynamic threshold: ${threshold} (hasTextMatches: ${hasTextMatches})`);

  // Vector search
  const vectorLimit = limit * 6;
  const vectorSearchParams = {
    vector: embedding,
    limit: vectorLimit,
    score_threshold: threshold,
    with_payload: true
  };

  if (filter) {
    vectorSearchParams.filter = filter;
  }

  const vectorResults = await qdrant.search(collectionName, vectorSearchParams);

  const mappedVectorResults = vectorResults.map(hit => ({
    id: hit.id,
    score: hit.score,
    payload: hit.payload,
    title: hit.payload?.title || hit.payload?.metadata?.title || 'Unbekannt',
    text: hit.payload?.chunk_text || '',
    url: hit.payload?.url || hit.payload?.source_url || hit.payload?.metadata?.url || null,
    qualityScore: hit.payload?.quality_score
  }));

  console.error(`[HybridSearch] Vector: ${mappedVectorResults.length}, Text: ${textResults.length}`);

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

  // Apply fusion
  let combinedResults = shouldUseRRF
    ? applyRRF(mappedVectorResults, textResults, limit * 2, rrfK)
    : applyWeightedCombination(mappedVectorResults, textResults, vW, tW, limit * 2);

  // Apply quality gate
  combinedResults = applyQualityGate(combinedResults, hasTextMatches);

  // Apply quality-weighted scoring
  const finalResults = combinedResults.slice(0, limit).map(result => {
    const qualityScore = result.qualityScore ?? result.payload?.quality_score ?? 1.0;
    const qualityBoost = 1 + ((qualityScore - 0.5) * 0.4);

    return {
      score: result.score * qualityBoost,
      title: result.title || result.payload?.title || 'Unbekannt',
      text: result.text || result.payload?.chunk_text || '',
      url: result.url || result.payload?.url || result.payload?.source_url || result.payload?.metadata?.url || null,
      documentId: result.documentId || result.payload?.document_id,
      filename: result.filename || result.payload?.filename,
      searchMethod: result.searchMethod,
      qualityScore
    };
  });

  console.error(`[HybridSearch] Returning ${finalResults.length} results (fusion: ${shouldUseRRF ? 'RRF' : 'weighted'})`);

  return {
    results: finalResults,
    metadata: {
      vectorResults: mappedVectorResults.length,
      textResults: textResults.length,
      fusionMethod: shouldUseRRF ? 'RRF' : 'weighted',
      hasTextMatches
    }
  };
}

/**
 * Text-only search
 */
export async function textSearchCollection(collectionName, query, limit = 5, filter = null) {
  const textResults = await performTextSearch(collectionName, query, limit * 2, filter);

  return textResults.slice(0, limit).map(result => ({
    score: result.score,
    title: result.payload?.title || result.payload?.metadata?.title || 'Unbekannt',
    text: result.payload?.chunk_text || '',
    url: result.payload?.url || result.payload?.source_url || result.payload?.metadata?.url || null,
    documentId: result.payload?.document_id,
    filename: result.payload?.filename || result.payload?.metadata?.filename,
    searchMethod: 'text',
    matchType: result.matchType
  }));
}

export async function getCollectionInfo(collectionName) {
  const qdrant = await getQdrantClient();

  try {
    const info = await qdrant.getCollection(collectionName);
    return {
      name: collectionName,
      pointsCount: info.points_count,
      status: info.status
    };
  } catch (error) {
    return {
      name: collectionName,
      error: error.message
    };
  }
}

/**
 * Get unique values for a specific field in a collection
 * Used for filter discovery - returns all distinct values for a given field
 */
export async function getUniqueFieldValues(collectionName, fieldName, limit = 100) {
  const qdrant = await getQdrantClient();

  try {
    const scrollResult = await qdrant.scroll(collectionName, {
      limit: 1000,
      with_payload: { include: [fieldName] },
      with_vector: false
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
  } catch (error) {
    console.error(`[Qdrant] Error fetching unique values for ${fieldName}:`, error.message);
    return [];
  }
}

/**
 * Get unique field values with document counts (faceted search)
 * Returns values sorted by count (most common first)
 */
export async function getFieldValueCounts(collectionName, fieldName, maxValues = 50, baseFilter = null) {
  const qdrant = await getQdrantClient();

  try {
    const valueCounts = new Map();
    let offset = null;
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      const scrollOptions = {
        limit: 100,
        offset: offset,
        with_payload: { include: [fieldName] },
        with_vector: false
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
  } catch (error) {
    console.error(`[Qdrant] Error fetching value counts for ${fieldName}:`, error.message);
    return [];
  }
}
