/**
 * QdrantOperations - Reusable Qdrant operations for all search services
 * Extracted from QdrantService to eliminate code duplication
 */
class QdrantOperations {
    constructor(qdrantClient) {
        this.client = qdrantClient;
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
            rrfK = 60
        } = options;

        try {
            console.log(`[QdrantOperations] Hybrid search - vector weight: ${vectorWeight}, text weight: ${textWeight}`);

            // Execute vector search
            const vectorResults = await this.vectorSearch(collection, queryVector, filter, {
                limit: Math.round(limit * 1.5),
                threshold,
                withPayload: true,
                ef: Math.max(100, limit * 2)
            });

            // Execute text-based searches
            const textResults = await this.performTextSearch(collection, query, filter, limit);

            console.log(`[QdrantOperations] Vector: ${vectorResults.length} results, Text: ${textResults.length} results`);

            // Apply fusion method
            const combinedResults = useRRF 
                ? this.applyReciprocalRankFusion(vectorResults, textResults, limit, rrfK)
                : this.applyWeightedCombination(vectorResults, textResults, vectorWeight, textWeight, limit);

            return {
                success: true,
                results: combinedResults,
                metadata: {
                    vectorResults: vectorResults.length,
                    textResults: textResults.length,
                    fusionMethod: useRRF ? 'RRF' : 'weighted',
                    vectorWeight,
                    textWeight
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
            // Create text match filter
            const textFilter = {
                must: [...(baseFilter.must || [])]
            };

            // Add text match condition
            textFilter.must.push({
                key: 'chunk_text',
                match: { text: searchTerm }
            });

            // Use scroll API for text search
            const scrollResult = await this.client.scroll(collection, {
                filter: textFilter,
                limit: limit,
                with_payload: true,
                with_vector: false
            });

            // Add search metadata and scores
            return scrollResult.points.map((point, index) => ({
                id: point.id,
                score: this.calculateTextSearchScore(searchTerm, point.payload.chunk_text, index),
                payload: point.payload,
                searchMethod: 'text',
                searchTerm: searchTerm
            }));

        } catch (error) {
            console.warn(`[QdrantOperations] Text search failed for "${searchTerm}":`, error.message);
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
                searchMethod: 'vector'
            });
        });

        // Process text results
        textResults.forEach((result, index) => {
            const rrfScore = 1 / (k + index + 1);
            const key = result.id;
            
            if (scoresMap.has(key)) {
                // Combine with existing vector result
                const existing = scoresMap.get(key);
                existing.rrfScore += rrfScore;
                existing.textRank = index + 1;
                existing.originalTextScore = result.score;
                existing.searchMethod = 'hybrid';
            } else {
                // New text-only result
                scoresMap.set(key, {
                    item: result,
                    rrfScore: rrfScore,
                    vectorRank: null,
                    textRank: index + 1,
                    originalVectorScore: null,
                    originalTextScore: result.score,
                    searchMethod: 'text'
                });
            }
        });

        // Sort by RRF score and return top results
        return Array.from(scoresMap.values())
            .sort((a, b) => b.rrfScore - a.rrfScore)
            .slice(0, limit)
            .map(result => ({
                ...result.item,
                score: result.rrfScore,
                searchMethod: result.searchMethod,
                originalVectorScore: result.originalVectorScore,
                originalTextScore: result.originalTextScore
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