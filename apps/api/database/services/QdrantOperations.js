/**
 * QdrantOperations - Reusable Qdrant operations for all search services
 * Extracted from QdrantService to eliminate code duplication
 */

import { vectorConfig } from '../../config/vectorConfig.js';
import { createLogger } from '../../utils/logger.js';
import {
  foldUmlauts,
  normalizeQuery,
  tokenizeQuery,
  generateQueryVariants
} from '../../utils/textNormalization.js';

const logger = createLogger('QdrantOperations');

class QdrantOperations {
    constructor(qdrantClient) {
        this.client = qdrantClient;
        this.hybridConfig = vectorConfig.get('hybrid');
    }

    /**
     * Vector search with quality-aware filtering and boosting
     * @param {string} collection
     * @param {Array<number>} queryVector
     * @param {Object} filter
     * @param {Object} options { limit, threshold, withPayload, withVector, ef }
     * @returns {Promise<Array>}
     */
    async searchWithQuality(collection, queryVector, filter = {}, options = {}) {
        const qualityCfg = vectorConfig.get('quality');
        const retrievalCfg = qualityCfg.retrieval || {};

        const results = await this.vectorSearch(collection, queryVector, filter, options);

        // Apply quality filter if enabled
        let filtered = results;
        if (retrievalCfg.enableQualityFilter) {
            const minQ = retrievalCfg.minRetrievalQuality ?? 0.4;
            filtered = results.filter(r => {
                const q = r?.payload?.quality_score;
                return typeof q === 'number' ? q >= minQ : true; // keep legacy chunks without quality
            });
        }

        // Apply quality-based re-ranking/boosting
        const boost = retrievalCfg.qualityBoostFactor ?? 1.2;
        const rescored = filtered.map(r => {
            const q = typeof r?.payload?.quality_score === 'number' ? r.payload.quality_score : 1.0;
            return { ...r, score: r.score * (1 + (q - 0.5) * (boost - 1)) };
        }).sort((a, b) => b.score - a.score);

        const limit = options.limit || 10;
        return rescored.slice(0, limit);
    }

    /**
     * Intent-aware vector search. Merges base filter with intent-based preferences.
     * @param {string} collection
     * @param {Array<number>} queryVector
     * @param {{type:string,language:string}} intent
     * @param {Object} baseFilter
     * @param {Object} options
     */
    async searchWithIntent(collection, queryVector, intent, baseFilter = {}, options = {}) {
        const merged = this.mergeFilters(baseFilter, intent?.filter || {});
        // If caller passed full intent object from QueryIntentService, generate filter structure
        if (!intent?.filter && intent) {
            try {
                const { QueryIntentService } = await import('../../services/QueryIntentService.js');
                const svc = new QueryIntentService();
                const f = svc.generateSearchFilters(intent);
                return await this.searchWithQuality(collection, queryVector, this.mergeFilters(baseFilter, f), options);
            } catch (e) {
                // If service not available, just fall back to quality search with base filter
                return await this.searchWithQuality(collection, queryVector, baseFilter, options);
            }
        }
        return await this.searchWithQuality(collection, queryVector, merged, options);
    }

    /**
     * Fetch a chunk and its nearby context from the same document
     * @param {string} collection
     * @param {string|Object} pointOrId - point id or result object with payload
     * @param {Object} options { window = 1 }
     */
    async getChunkWithContext(collection, pointOrId, options = {}) {
        const { window = 1 } = options;
        let point;
        if (typeof pointOrId === 'string' || typeof pointOrId === 'number') {
            const res = await this.client.getPoints(collection, {
                ids: [pointOrId],
                with_payload: true,
                with_vector: false
            });
            point = res?.result?.[0];
        } else {
            point = pointOrId;
        }

        if (!point?.payload) return { center: null, context: [] };
        const docId = point.payload.document_id;
        const idx = point.payload.chunk_index ?? 0;

        // Fetch neighbors by chunk_index +/- window
        const filter = {
            must: [
                { key: 'document_id', match: { value: docId } },
                { key: 'chunk_index', range: { gte: Math.max(0, idx - window), lte: idx + window } }
            ]
        };

        const scroll = await this.client.scroll(collection, {
            filter,
            limit: 100,
            with_payload: true,
            with_vector: false
        });
        const points = (scroll.points || []).sort((a, b) => (a.payload.chunk_index ?? 0) - (b.payload.chunk_index ?? 0));
        return {
            center: point,
            context: points
        };
    }

    /** Merge two Qdrant filters (supports must/must_not/should) */
    mergeFilters(a = {}, b = {}) {
        const out = { must: [], must_not: [], should: [] };
        if (Array.isArray(a.must)) out.must.push(...a.must);
        if (Array.isArray(b.must)) out.must.push(...b.must);
        if (Array.isArray(a.must_not)) out.must_not.push(...a.must_not);
        if (Array.isArray(b.must_not)) out.must_not.push(...b.must_not);
        if (Array.isArray(a.should)) out.should.push(...a.should);
        if (Array.isArray(b.should)) out.should.push(...b.should);
        // Clean up empty arrays to keep filter concise
        if (out.must.length === 0) delete out.must;
        if (out.must_not.length === 0) delete out.must_not;
        if (out.should.length === 0) delete out.should;
        return out;
    }

    /**
     * Perform vector similarity search
     * @param {string} collection - Collection name
     * @param {Array} queryVector - Query embedding vector
     * @param {Object} filter - Qdrant filter object
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async vectorSearch(collection, queryVector, filter = {}, options = {}) {
        const {
            limit = 10,
            threshold = 0.3,
            withPayload = true,
            withVector = false,
            ef = null
        } = options;

        try {
            const searchParams = {
                vector: queryVector,
                filter: Object.keys(filter).length > 0 ? filter : undefined,
                limit: limit,
                score_threshold: threshold,
                with_payload: withPayload,
                with_vector: withVector
            };

            if (ef && ef > 0) {
                searchParams.params = { ef };
            }

            const results = await this.client.search(collection, searchParams);

            logger.info(`Vector search: ${results.length} results, top score: ${results[0]?.score.toFixed(3) || 'none'}`);

            return results.map(hit => ({
                id: hit.id,
                score: hit.score,
                payload: hit.payload || {},
                vector: hit.vector || null
            }));

        } catch (error) {
            logger.error(`Vector search failed: ${error.message}`);
            throw new Error(`Vector search failed: ${error.message}`);
        }
    }

    /**
     * Perform hybrid search combining vector and keyword search
     * @param {string} collection - Collection name
     * @param {Array} queryVector - Query embedding vector
     * @param {string} query - Original text query
     * @param {Object} filter - Base filter object
     * @param {Object} options - Hybrid search options
     * @returns {Promise<Object>} Hybrid search results with metadata
     */
    async hybridSearch(collection, queryVector, query, filter = {}, options = {}) {
        const {
            limit = 10,
            threshold = 0.3,
            vectorWeight = 0.7,
            textWeight = 0.3,
            useRRF = true,
            rrfK = 60,
            recallLimit
        } = options;

        try {
            logger.debug(`Hybrid search - vector weight: ${vectorWeight}, text weight: ${textWeight}`);

            const recallText = Math.max(limit, recallLimit || (limit * 4));
            const textResults = await this.performTextSearch(collection, query, filter, recallText);

            const dynamicThreshold = this.hybridConfig.enableDynamicThresholds
                ? this.calculateDynamicThreshold(threshold, textResults.length > 0)
                : threshold;

            logger.debug(`Using dynamic threshold: ${dynamicThreshold} (text matches: ${textResults.length})`);

            const recallVec = Math.max(limit, Math.round((recallLimit || (limit * 4)) * 1.5));
            const vectorResults = await this.vectorSearch(collection, queryVector, filter, {
                limit: recallVec,
                threshold: dynamicThreshold,
                withPayload: true,
                ef: Math.max(100, recallVec * 2)
            });

            logger.info(`Vector: ${vectorResults.length} results, Text: ${textResults.length} results`);

            let shouldUseRRF = useRRF;
            let vW = vectorWeight;
            let tW = textWeight;

            const hasRealTextMatches = textResults.some(r =>
                r.matchType && r.matchType !== 'token_fallback'
            );

            if (!hasRealTextMatches && textResults.length > 0 && useRRF) {
                logger.debug(`Only token fallback matches found (${textResults.length} results) - switching from RRF to weighted fusion`);
                shouldUseRRF = false;
                vW = 0.85;
                tW = 0.15;
            } else if (textResults.length === 0 && useRRF) {
                logger.debug('Text search failed (0 results) - switching from RRF to weighted fusion');
                shouldUseRRF = false;
                vW = 0.85;
                tW = 0.15;
            } else if (useRRF && textResults.length < 3) {
                logger.debug(`Too few text results (${textResults.length}) for effective RRF - switching to weighted fusion`);
                shouldUseRRF = false;
                vW = 0.85;
                tW = 0.15;
            } else if (!useRRF) {
                if (textResults.length === 0 || !hasRealTextMatches) {
                    vW = 0.85; tW = 0.15;
                } else {
                    vW = 0.5; tW = 0.5;
                }
                logger.debug(`Dynamic weights applied: vectorWeight=${vW}, textWeight=${tW}`);
            }

            // Apply fusion method with confidence weighting
            let combinedResults = shouldUseRRF
                ? this.applyReciprocalRankFusion(vectorResults, textResults, limit, rrfK)
                : this.applyWeightedCombination(vectorResults, textResults, vW, tW, limit);

            // Apply post-fusion quality gate
            if (this.hybridConfig.enableQualityGate) {
                combinedResults = this.applyQualityGate(combinedResults, textResults.length > 0);
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
                    qualityFiltered: this.hybridConfig.enableQualityGate,
                    autoSwitchedFromRRF: useRRF && !shouldUseRRF,
                    hasRealTextMatches: hasRealTextMatches,
                    textMatchTypes: [...new Set(textResults.map(r => r.matchType).filter(Boolean))]
                }
            };

        } catch (error) {
            logger.error(`Hybrid search failed: ${error.message}`);
            throw new Error(`Hybrid search failed: ${error.message}`);
        }
    }

    /**
     * Perform text-based search using Qdrant's scroll API with multi-variant support
     * Searches all query variants in parallel for robust matching of hyphenated/spaced terms
     * @param {string} collection - Collection name
     * @param {string} searchTerm - Text to search for
     * @param {Object} baseFilter - Base filter object
     * @param {number} limit - Result limit
     * @returns {Promise<Array>} Text search results
     * @private
     */
    async performTextSearch(collection, searchTerm, baseFilter = {}, limit = 10) {
        try {
            logger.debug(`Text search: "${searchTerm}" in collection "${collection}"`);

            // Generate all query variants for robust matching
            const variants = generateQueryVariants(searchTerm);
            logger.debug(`Generated ${variants.length} query variants: ${variants.join(', ')}`);

            // Search all variants in parallel
            const variantSearchPromises = variants.map(async (variant) => {
                const textFilter = {
                    must: [...(baseFilter.must || [])]
                };
                textFilter.must.push({
                    key: 'chunk_text',
                    match: { text: variant }
                });

                try {
                    const scrollResult = await this.client.scroll(collection, {
                        filter: textFilter,
                        limit: Math.ceil(limit / variants.length) + 5, // Distribute limit across variants
                        with_payload: true,
                        with_vector: false
                    });
                    return {
                        variant,
                        points: scrollResult.points || [],
                        matchType: variant === searchTerm.toLowerCase() ? 'exact' : 'variant'
                    };
                } catch (err) {
                    logger.warn(`Variant search failed for "${variant}": ${err.message}`);
                    return { variant, points: [], matchType: 'error' };
                }
            });

            const variantResults = await Promise.all(variantSearchPromises);

            // Merge and deduplicate results from all variants
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

            logger.debug(`Variant search found ${mergedPoints.length} unique points from ${variants.length} variants`);

            // If no results from variant search, try token fallback
            if (mergedPoints.length === 0) {
                const normalizedTerm = normalizeQuery(searchTerm);
                const tokens = tokenizeQuery(normalizedTerm || searchTerm).filter(t => t.length >= 4);
                if (tokens.length > 1) {
                    logger.debug(`Token fallback for terms: ${tokens.join(', ')}`);
                    const tokenSearchPromises = tokens.map(async (tok) => {
                        const tokFilter = { must: [...(baseFilter.must || [])] };
                        tokFilter.must.push({ key: 'chunk_text', match: { text: tok } });
                        try {
                            const tokRes = await this.client.scroll(collection, {
                                filter: tokFilter,
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
                            if (!tokenSeen.has(p.id)) tokenSeen.set(p.id, { point: p, variant: 'token', matchType: 'token_fallback' });
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

            const results = mergedPoints.map(({ point, variant }, index) => ({
                id: point.id,
                score: this.calculateTextSearchScore(searchTerm, point.payload.chunk_text, index),
                payload: point.payload,
                searchMethod: 'text',
                searchTerm: searchTerm,
                matchedVariant: variant,
                matchType: matchType
            }));

            // Sort by score and limit
            results.sort((a, b) => b.score - a.score);
            const limitedResults = results.slice(0, limit);

            logger.debug(`Text search returning ${limitedResults.length} processed results (matchType: ${matchType})`);
            return limitedResults;

        } catch (error) {
            logger.warn(`Text search failed for "${searchTerm}": ${error.message}`);
            return [];
        }
    }

    /**
     * Calculate text search score based on term frequency and position
     * @param {string} searchTerm - Search term
     * @param {string} text - Text to search in
     * @param {number} position - Result position
     * @returns {number} Calculated score
     * @private
     */
    calculateTextSearchScore(searchTerm, text, position) {
        if (!text || !searchTerm) return 0.1;

        const lowerText = text.toLowerCase();
        const lowerTerm = searchTerm.toLowerCase();
        
        // Count matches
        const matches = (lowerText.match(new RegExp(lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        let score = Math.min(matches * 0.1, 0.8);

        // Position penalty
        const positionPenalty = Math.max(0.1, 1 - (position * 0.1));
        score *= positionPenalty;

        // Length normalization
        const lengthNormalization = Math.min(1, searchTerm.length / 10);
        score *= lengthNormalization;

        return Math.min(1.0, Math.max(0.1, score));
    }

    /**
     * Calculate dynamic threshold based on text match presence
     * @param {number} baseThreshold - Base threshold from options
     * @param {boolean} hasTextMatches - Whether text search found results
     * @returns {number} Dynamic threshold
     * @private
     */
    calculateDynamicThreshold(baseThreshold, hasTextMatches) {
        if (!this.hybridConfig.enableDynamicThresholds) {
            return baseThreshold;
        }

        if (hasTextMatches) {
            // When text matches exist, use the lower threshold for vector similarity
            return Math.max(baseThreshold, this.hybridConfig.minVectorWithTextThreshold);
        } else {
            // When no text matches exist, require much higher vector similarity
            return Math.max(baseThreshold, this.hybridConfig.minVectorOnlyThreshold);
        }
    }

    /**
     * Apply Reciprocal Rank Fusion to combine vector and text results
     * @param {Array} vectorResults - Vector search results
     * @param {Array} textResults - Text search results
     * @param {number} limit - Final result limit
     * @param {number} k - RRF constant
     * @returns {Array} Fused results
     * @private
     */
    applyReciprocalRankFusion(vectorResults, textResults, limit, k = 60) {
        const scoresMap = new Map();
        
        // Process vector results
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
                confidence: this.hybridConfig.enableConfidenceWeighting ? this.hybridConfig.confidencePenalty : 1.0
            });
        });

        // Process text results
        textResults.forEach((result, index) => {
            const rrfScore = 1 / (k + index + 1);
            const key = result.id;
            
            if (scoresMap.has(key)) {
                // Combine with existing vector result - found by both methods
                const existing = scoresMap.get(key);
                existing.rrfScore += rrfScore;
                existing.textRank = index + 1;
                existing.originalTextScore = result.score;
                existing.searchMethod = 'hybrid';
                // Boost confidence for items found by both methods
                existing.confidence = this.hybridConfig.enableConfidenceWeighting ? this.hybridConfig.confidenceBoost : 1.0;
            } else {
                // New text-only result
                scoresMap.set(key, {
                    item: result,
                    rrfScore: rrfScore,
                    vectorRank: null,
                    textRank: index + 1,
                    originalVectorScore: null,
                    originalTextScore: result.score,
                    searchMethod: 'text',
                    confidence: 1.0 // Neutral confidence for text-only matches
                });
            }
        });

        // Apply confidence weighting and sort by final score
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
                originalTextScore: result.originalTextScore,
                confidence: result.confidence,
                rawRRFScore: result.rrfScore
            }));
    }

    /**
     * Apply weighted combination to merge vector and text results
     * @param {Array} vectorResults - Vector search results
     * @param {Array} textResults - Text search results
     * @param {number} vectorWeight - Weight for vector scores
     * @param {number} textWeight - Weight for text scores
     * @param {number} limit - Final result limit
     * @returns {Array} Combined results
     * @private
     */
    applyWeightedCombination(vectorResults, textResults, vectorWeight, textWeight, limit) {
        const scoresMap = new Map();
        
        // Normalize weights
        const totalWeight = vectorWeight + textWeight;
        const normalizedVectorWeight = vectorWeight / totalWeight;
        const normalizedTextWeight = textWeight / totalWeight;

        // Process vector results
        vectorResults.forEach(result => {
            scoresMap.set(result.id, {
                item: result,
                vectorScore: result.score * normalizedVectorWeight,
                textScore: 0,
                originalVectorScore: result.score,
                originalTextScore: null,
                searchMethod: 'vector'
            });
        });

        // Process text results
        textResults.forEach(result => {
            const key = result.id;
            const textScore = result.score * normalizedTextWeight;
            
            if (scoresMap.has(key)) {
                // Combine with existing vector result
                const existing = scoresMap.get(key);
                existing.textScore = textScore;
                existing.originalTextScore = result.score;
                existing.searchMethod = 'hybrid';
            } else {
                // New text-only result
                scoresMap.set(key, {
                    item: result,
                    vectorScore: 0,
                    textScore: textScore,
                    originalVectorScore: null,
                    originalTextScore: result.score,
                    searchMethod: 'text'
                });
            }
        });

        // Calculate combined scores and sort
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
     * Apply quality gate to filter out low-quality results after fusion
     * @param {Array} results - Fused results
     * @param {boolean} hasTextMatches - Whether text search found results
     * @returns {Array} Quality-filtered results
     * @private
     */
    applyQualityGate(results, hasTextMatches) {
        if (!this.hybridConfig.enableQualityGate || !results || results.length === 0) {
            return results;
        }

        logger.debug(`Quality gate: filtering ${results.length} results (hasTextMatches: ${hasTextMatches})`);

        if (results.length > 0) {
            const scores = results.map(r => r.score);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            logger.debug(`Score distribution: min=${minScore.toFixed(6)}, max=${maxScore.toFixed(6)}, avg=${avgScore.toFixed(6)}`);
        }

        const filteredResults = results.filter((result) => {
            if (result.score < this.hybridConfig.minFinalScore) {
                return false;
            }

            if (result.searchMethod === 'vector' && !hasTextMatches) {
                if (result.score < this.hybridConfig.minVectorOnlyFinalScore) {
                    return false;
                }
            }

            return true;
        });

        const removedCount = results.length - filteredResults.length;
        logger.debug(`Quality gate: kept ${filteredResults.length}/${results.length}${removedCount > 0 ? `, removed ${removedCount}` : ''}`);

        return filteredResults;
    }

    /**
     * Batch upsert points to collection
     * @param {string} collection - Collection name
     * @param {Array} points - Points to upsert
     * @param {Object} options - Upsert options
     * @returns {Promise<Object>} Upsert result
     */
    async batchUpsert(collection, points, options = {}) {
        const { wait = true, maxRetries = 3 } = options;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.client.upsert(collection, {
                    wait: wait,
                    points: points
                });

                logger.info(`Batch upserted ${points.length} points to ${collection}`);
                return {
                    success: true,
                    pointsUpserted: points.length,
                    collection: collection
                };

            } catch (error) {
                lastError = error;
                logger.warn(`Batch upsert attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`Batch upsert failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Batch delete points by filter
     * @param {string} collection - Collection name
     * @param {Object} filter - Delete filter
     * @returns {Promise<Object>} Delete result
     */
    async batchDelete(collection, filter) {
        try {
            await this.client.delete(collection, { filter });

            logger.info(`Batch deleted points from ${collection}`);
            return { success: true, collection };

        } catch (error) {
            logger.error(`Batch delete failed: ${error.message}`);
            throw new Error(`Batch delete failed: ${error.message}`);
        }
    }

    /**
     * Scroll through documents with filter
     * @param {string} collection - Collection name
     * @param {Object} filter - Scroll filter
     * @param {Object} options - Scroll options
     * @returns {Promise<Array>} Scrolled points
     */
    async scrollDocuments(collection, filter = {}, options = {}) {
        const { limit = 100, withPayload = true, withVector = false, offset = null } = options;

        if (limit <= 0) {
            logger.warn(`Invalid limit value: ${limit}. Returning empty array.`);
            return [];
        }

        try {
            const scrollParams = {
                filter: Object.keys(filter).length > 0 ? filter : undefined,
                limit,
                with_payload: withPayload,
                with_vector: withVector
            };

            if (offset !== null) {
                scrollParams.offset = offset;
            }

            const result = await this.client.scroll(collection, scrollParams);
            return result.points || [];

        } catch (error) {
            logger.error(`Scroll failed: ${error.message}`);

            if (error.message && (error.message.includes('SSL') ||
                                  error.message.includes('wrong version') ||
                                  error.message.includes('fetch failed'))) {
                logger.warn('Connection error detected, suggesting connection reset');
            }

            throw new Error(`Scroll operation failed: ${error.message}`);
        }
    }

    /**
     * Health check for Qdrant connection
     * @returns {Promise<boolean>} Health status
     */
    async healthCheck() {
        try {
            await this.client.getCollections();
            return true;
        } catch (error) {
            logger.error(`Health check failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get collection statistics
     * @param {string} collection - Collection name
     * @returns {Promise<Object>} Collection stats
     */
    async getCollectionStats(collection) {
        try {
            const info = await this.client.getCollection(collection);
            return {
                name: collection,
                vectors_count: info.vectors_count,
                indexed_vectors_count: info.indexed_vectors_count,
                points_count: info.points_count,
                status: info.status
            };
        } catch (error) {
            logger.error(`Failed to get collection stats: ${error.message}`);
            return { error: error.message };
        }
    }
}

export { QdrantOperations };
