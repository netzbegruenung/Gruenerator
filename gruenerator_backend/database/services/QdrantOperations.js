/**
 * QdrantOperations - Reusable Qdrant operations for all search services
 * Extracted from QdrantService to eliminate code duplication
 */

import { vectorConfig } from '../../config/vectorConfig.js';

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
            
            return results.map(hit => ({
                id: hit.id,
                score: hit.score,
                payload: hit.payload || {},
                vector: hit.vector || null
            }));

        } catch (error) {
            console.error('[QdrantOperations] Vector search failed:', error);
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
            console.log(`[QdrantOperations] Hybrid search - vector weight: ${vectorWeight}, text weight: ${textWeight}`);

            // Execute text search first (with query normalization) to determine dynamic threshold
            const recallText = Math.max(limit, recallLimit || (limit * 4));
            const textResults = await this.performTextSearch(collection, query, filter, recallText);

            // Apply dynamic threshold adjustment based on text match presence
            const dynamicThreshold = this.hybridConfig.enableDynamicThresholds 
                ? this.calculateDynamicThreshold(threshold, textResults.length > 0)
                : threshold;
                
            console.log(`[QdrantOperations] Using dynamic threshold: ${dynamicThreshold} (text matches: ${textResults.length})`);

            // Execute vector search with dynamic threshold
            const recallVec = Math.max(limit, Math.round((recallLimit || (limit * 4)) * 1.5));
            const vectorResults = await this.vectorSearch(collection, queryVector, filter, {
                limit: recallVec,
                threshold: dynamicThreshold,
                withPayload: true,
                ef: Math.max(100, recallVec * 2)
            });

            console.log(`[QdrantOperations] Vector: ${vectorResults.length} results, Text: ${textResults.length} results`);

            // Dynamic weight shifting if not using RRF
            let vW = vectorWeight;
            let tW = textWeight;
            if (!useRRF) {
                if (textResults.length === 0) {
                    // No text hits → rely more on vectors
                    vW = 0.85; tW = 0.15;
                } else {
                    // Text hits present → balanced
                    vW = 0.5; tW = 0.5;
                }
                console.log(`[QdrantOperations] Dynamic weights applied: vectorWeight=${vW}, textWeight=${tW}`);
            }

            // Apply fusion method with confidence weighting
            let combinedResults = useRRF 
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
                    fusionMethod: useRRF ? 'RRF' : 'weighted',
                    vectorWeight,
                    textWeight,
                    dynamicThreshold,
                    qualityFiltered: this.hybridConfig.enableQualityGate
                }
            };

        } catch (error) {
            console.error('[QdrantOperations] Hybrid search failed:', error);
            throw new Error(`Hybrid search failed: ${error.message}`);
        }
    }

    /**
     * Perform text-based search using Qdrant's scroll API
     * @param {string} collection - Collection name
     * @param {string} searchTerm - Text to search for
     * @param {Object} baseFilter - Base filter object
     * @param {number} limit - Result limit
     * @returns {Promise<Array>} Text search results
     * @private
     */
    async performTextSearch(collection, searchTerm, baseFilter = {}, limit = 10) {
        try {
            console.log(`[QdrantOperations] Text search: "${searchTerm}" in collection "${collection}"`);
            
            // Create text match filter
            const textFilter = {
                must: [...(baseFilter.must || [])]
            };

            // Add text match condition
            textFilter.must.push({
                key: 'chunk_text',
                match: { text: searchTerm }
            });

            console.log(`[QdrantOperations] Text filter:`, JSON.stringify(textFilter, null, 2));

            // Use scroll API for text search
            const scrollResult = await this.client.scroll(collection, {
                filter: textFilter,
                limit: limit,
                with_payload: true,
                with_vector: false
            });

            console.log(`[QdrantOperations] Text search raw results: ${scrollResult.points?.length || 0} points found`);

            // Query-side normalization & fallbacks if no results
            let mergedPoints = scrollResult.points || [];
            if (mergedPoints.length === 0) {
                // Attempt 1: dehyphenated/cleaned variant
                const normalizedTerm = this.normalizeQuery(searchTerm);
                if (normalizedTerm && normalizedTerm !== searchTerm) {
                    const normFilter = { must: [...(baseFilter.must || [])] };
                    normFilter.must.push({ key: 'chunk_text', match: { text: normalizedTerm } });
                    console.log(`[QdrantOperations] Retrying text search with normalized term: "${normalizedTerm}"`);
                    const normRes = await this.client.scroll(collection, {
                        filter: normFilter,
                        limit: limit,
                        with_payload: true,
                        with_vector: false
                    });
                    mergedPoints = normRes.points || [];
                    console.log(`[QdrantOperations] Normalized text search found: ${mergedPoints.length} points`);
                }

                // Attempt 2: umlaut-folded variant
                if (mergedPoints.length === 0) {
                    const folded = this.foldUmlauts(normalizedTerm || searchTerm);
                    if (folded && folded !== searchTerm) {
                        const foldFilter = { must: [...(baseFilter.must || [])] };
                        foldFilter.must.push({ key: 'chunk_text', match: { text: folded } });
                        console.log(`[QdrantOperations] Retrying text search with folded term: "${folded}"`);
                        const foldRes = await this.client.scroll(collection, {
                            filter: foldFilter,
                            limit: limit,
                            with_payload: true,
                            with_vector: false
                        });
                        mergedPoints = foldRes.points || [];
                        console.log(`[QdrantOperations] Folded text search found: ${mergedPoints.length} points`);
                    }
                }

                // Attempt 3: token OR fallback (merge per-token hits)
                if (mergedPoints.length === 0) {
                    const tokens = this.tokenizeQuery(normalizedTerm || searchTerm).filter(t => t.length >= 4);
                    if (tokens.length > 1) {
                        console.log(`[QdrantOperations] Token fallback for terms: ${tokens.join(', ')}`);
                        const seen = new Map();
                        for (const tok of tokens) {
                            const tokFilter = { must: [...(baseFilter.must || [])] };
                            tokFilter.must.push({ key: 'chunk_text', match: { text: tok } });
                            const tokRes = await this.client.scroll(collection, {
                                filter: tokFilter,
                                limit: limit,
                                with_payload: true,
                                with_vector: false
                            });
                            (tokRes.points || []).forEach(p => { if (!seen.has(p.id)) seen.set(p.id, p); });
                        }
                        mergedPoints = Array.from(seen.values());
                        console.log(`[QdrantOperations] Token OR fallback found: ${mergedPoints.length} unique points`);
                    }
                }
            }

            if (scrollResult.points && scrollResult.points.length > 0) {
                console.log(`[QdrantOperations] Text search matches found:`);
                (scrollResult.points || []).forEach((point, index) => {
                    const chunkText = point.payload?.chunk_text || '';
                    const title = point.payload?.title || 'Untitled';
                    const filename = point.payload?.filename || 'No filename';
                    
                    // Find and highlight the matching text
                    const lowerText = chunkText.toLowerCase();
                    const lowerTerm = searchTerm.toLowerCase();
                    const matchIndex = lowerText.indexOf(lowerTerm);
                    
                    let excerpt = '';
                    if (matchIndex !== -1) {
                        const start = Math.max(0, matchIndex - 30);
                        const end = Math.min(chunkText.length, matchIndex + searchTerm.length + 30);
                        excerpt = '...' + chunkText.slice(start, end) + '...';
                        // Highlight the match
                        const highlightStart = matchIndex - start + 3; // +3 for '...'
                        excerpt = excerpt.slice(0, highlightStart) + `**${chunkText.slice(matchIndex, matchIndex + searchTerm.length)}**` + excerpt.slice(highlightStart + searchTerm.length);
                    } else {
                        excerpt = chunkText.slice(0, 100) + '...';
                    }
                    
                    console.log(`   ${index + 1}. Document: "${title}" (${filename})`);
                    console.log(`      Match: ${excerpt}`);
                    console.log(`      Chunk ID: ${point.id}, Document ID: ${point.payload?.document_id}`);
                });
            } else {
                console.log(`[QdrantOperations] No text matches found for "${searchTerm}"`);
            }

            // Add search metadata and scores
            const results = (mergedPoints || []).map((point, index) => ({
                id: point.id,
                score: this.calculateTextSearchScore(searchTerm, point.payload.chunk_text, index),
                payload: point.payload,
                searchMethod: 'text',
                searchTerm: searchTerm
            }));

            console.log(`[QdrantOperations] Text search returning ${results.length} processed results`);
            return results;

        } catch (error) {
            console.warn(`[QdrantOperations] Text search failed for "${searchTerm}":`, error.message);
            console.error(`[QdrantOperations] Text search error stack:`, error.stack);
            return [];
        }
    }

    /** Replace German umlauts with ASCII folds */
    foldUmlauts(q) {
        if (!q) return q;
        return q
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
            .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
            .replace(/ß/g, 'ss');
    }

    /** Tokenize a query conservatively */
    tokenizeQuery(q) {
        return (q || '')
            .replace(/[\u00AD]/g, '')
            .replace(/[^A-Za-zÄÖÜäöüß0-9\-\s]/g, ' ')
            .split(/\s+/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    /** Normalize query for robust text matching (domain-agnostic) */
    normalizeQuery(q) {
        if (!q) return q;
        let out = q.replace(/\u00AD/g, ''); // soft hyphen
        // dehyphenate across spaces (simple): turn "Wärm- ewende" into "Wärmewende"
        out = out.replace(/([A-Za-zÄÖÜäöüß])\s*[-–—]\s*([A-Za-zÄÖÜäöüß])/g, '$1$2');
        // collapse whitespace
        out = out.replace(/\s+/g, ' ').trim();
        return out;
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

        console.log(`[QdrantOperations] Quality gate: filtering ${results.length} results (hasTextMatches: ${hasTextMatches})`);
        
        // Log score distribution for debugging RRF ranges
        if (results.length > 0) {
            const scores = results.map(r => r.score);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            console.log(`[QdrantOperations] Score distribution: min=${minScore.toFixed(6)}, max=${maxScore.toFixed(6)}, avg=${avgScore.toFixed(6)}`);
            console.log(`[QdrantOperations] Quality thresholds: minFinal=${this.hybridConfig.minFinalScore}, minVectorOnly=${this.hybridConfig.minVectorOnlyFinalScore}`);
        }

        const filteredResults = results.filter((result, index) => {
            // Check minimum final score
            if (result.score < this.hybridConfig.minFinalScore) {
                console.log(`   Filtered out #${index + 1}: score ${result.score.toFixed(6)} < minFinal ${this.hybridConfig.minFinalScore}`);
                return false;
            }

            // Apply stricter threshold for vector-only results
            if (result.searchMethod === 'vector' && !hasTextMatches) {
                if (result.score < this.hybridConfig.minVectorOnlyFinalScore) {
                    console.log(`   Filtered out #${index + 1}: vector-only score ${result.score.toFixed(6)} < minVectorOnly ${this.hybridConfig.minVectorOnlyFinalScore}`);
                    return false;
                }
            }

            console.log(`   Kept #${index + 1}: ${result.searchMethod} method, score ${result.score.toFixed(6)} (doc: ${result.payload?.document_id})`);
            return true;
        });

        const removedCount = results.length - filteredResults.length;
        if (removedCount > 0) {
            console.log(`[QdrantOperations] Quality gate: removed ${removedCount} low-quality results`);
        }

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

                console.log(`[QdrantOperations] Batch upserted ${points.length} points to ${collection}`);
                return { 
                    success: true, 
                    pointsUpserted: points.length,
                    collection: collection
                };

            } catch (error) {
                lastError = error;
                console.warn(`[QdrantOperations] Batch upsert attempt ${attempt}/${maxRetries} failed:`, error.message);
                
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
            
            console.log(`[QdrantOperations] Batch deleted points from ${collection}`);
            return { success: true, collection };

        } catch (error) {
            console.error('[QdrantOperations] Batch delete failed:', error);
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
            console.error('[QdrantOperations] Scroll failed:', error);
            
            // Check for SSL/connection errors that might indicate stale connection
            if (error.message && (error.message.includes('SSL') || 
                                  error.message.includes('wrong version') || 
                                  error.message.includes('fetch failed'))) {
                console.warn('[QdrantOperations] Connection error detected, suggesting connection reset');
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
            console.error('[QdrantOperations] Health check failed:', error);
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
            console.error('[QdrantOperations] Failed to get collection stats:', error);
            return { error: error.message };
        }
    }
}

export { QdrantOperations };
