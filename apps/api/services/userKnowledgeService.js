import { getPostgresInstance } from '../database/services/PostgresService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { fastEmbedService } from './FastEmbedService.js';
import { smartChunkDocument } from '../utils/textChunker.js';
import { generateContentHash, generatePointId } from '../utils/hashUtils.js';

/**
 * User Knowledge Service
 * Handles user knowledge operations with Postgres storage and Qdrant vectorization
 */
class UserKnowledgeService {
    constructor() {
        this.postgres = null;
        this.qdrant = null;
        this.initPromise = null;
    }

    /**
     * Initialize the service
     */
    async init() {
        if (!this.initPromise) {
            this.initPromise = this._init();
        }
        return this.initPromise;
    }

    async _init() {
        try {
            this.postgres = getPostgresInstance();
            await this.postgres.ensureInitialized();
            
            this.qdrant = getQdrantInstance();
            await this.qdrant.init();
            
            // Initialize FastEmbed for vectorization
            await fastEmbedService.init();

            
            console.log('[UserKnowledgeService] Initialized successfully');
        } catch (error) {
            console.error('[UserKnowledgeService] Initialization failed:', error);
            throw error;
        }
    }


    /**
     * Ensure service is initialized
     */
    async ensureInitialized() {
        if (!this.postgres || !this.qdrant) {
            await this.init();
        }
    }

    /**
     * Get user knowledge entries
     */
    async getUserKnowledge(userId) {
        await this.ensureInitialized();
        
        try {
            const query = `
                SELECT id, title, content, knowledge_type, created_at, updated_at, tags,
                       embedding_id, embedding_hash, vector_indexed_at
                FROM user_knowledge 
                WHERE user_id = $1 AND is_active = true 
                ORDER BY created_at ASC 
                LIMIT 3
            `;
            
            const results = await this.postgres.query(query, [userId], { table: 'user_knowledge' });
            
            return results.map(row => ({
                id: row.id,
                title: row.title,
                content: row.content,
                created_at: row.created_at,
                updated_at: row.updated_at,
                tags: row.tags,
                knowledge_type: row.knowledge_type,
                embedding_id: row.embedding_id,
                embedding_hash: row.embedding_hash,
                vector_indexed_at: row.vector_indexed_at
            }));
            
        } catch (error) {
            console.error('[UserKnowledgeService] Failed to get user knowledge:', error);
            throw new Error(`Failed to retrieve knowledge: ${error.message}`);
        }
    }

    /**
     * Create or update user knowledge entry
     */
    async saveUserKnowledge(userId, knowledgeEntry) {
        await this.ensureInitialized();
        
        try {
            const { id, title, content, knowledge_type = 'general', tags = null } = knowledgeEntry;
            
            // Generate content hash for change detection
            const contentHash = generateContentHash(title + '\n' + content);
            
            let savedEntry;
            let isNew = false;
            
            if (id && !id.toString().startsWith('new-')) {
                // Update existing entry
                const updateResult = await this.postgres.update(
                    'user_knowledge',
                    {
                        title: title?.trim() || 'Unbenannter Eintrag',
                        content: content?.trim() || '',
                        knowledge_type,
                        tags,
                        embedding_hash: contentHash
                    },
                    { id, user_id: userId }
                );
                
                if (updateResult.data.length === 0) {
                    throw new Error('Knowledge entry not found or access denied');
                }
                
                savedEntry = updateResult.data[0];
            } else {
                // Create new entry
                savedEntry = await this.postgres.insert('user_knowledge', {
                    user_id: userId,
                    title: title?.trim() || 'Unbenannter Eintrag',
                    content: content?.trim() || '',
                    knowledge_type,
                    tags,
                    embedding_hash: contentHash,
                    is_active: true
                });
                isNew = true;
            }
            
            // Vectorize the content
            await this.vectorizeKnowledge(savedEntry);
            
            console.log(`[UserKnowledgeService] ${isNew ? 'Created' : 'Updated'} knowledge entry ${savedEntry.id} for user ${userId}`);
            
            return savedEntry;
            
        } catch (error) {
            console.error('[UserKnowledgeService] Failed to save knowledge:', error);
            throw new Error(`Failed to save knowledge: ${error.message}`);
        }
    }

    /**
     * Delete user knowledge entry
     */
    async deleteUserKnowledge(userId, knowledgeId) {
        await this.ensureInitialized();
        
        try {
            // First get the entry to check embedding_id
            const entry = await this.postgres.queryOne(
                'SELECT embedding_id FROM user_knowledge WHERE id = $1 AND user_id = $2 AND is_active = true',
                [knowledgeId, userId]
            );
            
            if (!entry) {
                throw new Error('Knowledge entry not found');
            }
            
            // Delete from Qdrant if vectorized
            if (entry.embedding_id && this.qdrant.isAvailable()) {
                try {
                    await this.qdrant.client.delete(this.qdrant.collections.user_knowledge, {
                        filter: {
                            must: [{ key: 'knowledge_id', match: { value: knowledgeId } }]
                        }
                    });
                    console.log(`[UserKnowledgeService] Deleted vectors for knowledge ${knowledgeId}`);
                } catch (qdrantError) {
                    console.warn('[UserKnowledgeService] Failed to delete vectors:', qdrantError.message);
                }
            }
            
            // Soft delete from Postgres
            await this.postgres.update(
                'user_knowledge',
                { is_active: false },
                { id: knowledgeId, user_id: userId }
            );
            
            console.log(`[UserKnowledgeService] Deleted knowledge entry ${knowledgeId} for user ${userId}`);
            
            return { success: true };
            
        } catch (error) {
            console.error('[UserKnowledgeService] Failed to delete knowledge:', error);
            throw new Error(`Failed to delete knowledge: ${error.message}`);
        }
    }

    /**
     * Vectorize knowledge entry and store in Qdrant
     */
    async vectorizeKnowledge(knowledgeEntry) {
        if (!this.qdrant.isAvailable()) {
            console.warn('[UserKnowledgeService] Qdrant not available, skipping vectorization');
            return;
        }
        
        try {
            const { id: knowledgeId, user_id: userId, title, content, embedding_hash } = knowledgeEntry;
            
            // Check if already vectorized with current content
            const existing = await this.postgres.queryOne(
                'SELECT embedding_id, embedding_hash FROM user_knowledge WHERE id = $1',
                [knowledgeId]
            );
            
            if (existing?.embedding_id && existing.embedding_hash === embedding_hash) {
                console.log(`[UserKnowledgeService] Knowledge ${knowledgeId} already vectorized with current content`);
                return existing.embedding_id;
            }
            
            // For short knowledge entries, use direct embedding without chunking
            const fullText = `${title}\n\n${content}`;
            
            let embeddings;
            if (fullText.length < 1000) {
                // Direct embedding for short content
                const embedding = await fastEmbedService.generateEmbedding(fullText);
                embeddings = [{ text: fullText, embedding, tokens: fullText.split(' ').length }];
            } else {
                // Chunk longer content
                const chunks = await smartChunkDocument(fullText, {
                    chunkSize: 500,
                    chunkOverlap: 50,
                    respectSentences: true
                });
                
                embeddings = [];
                for (const chunk of chunks) {
                    const embedding = await fastEmbedService.generateEmbedding(chunk.text);
                    embeddings.push({ text: chunk.text, embedding, tokens: chunk.tokens });
                }
            }
            
            // Store in Qdrant with user-based tenant filtering
            const points = embeddings.map((chunk, index) => ({
                id: generatePointId('knowledge', knowledgeId, index),
                vector: chunk.embedding,
                payload: {
                    knowledge_id: knowledgeId,
                    user_id: userId,
                    title: title,
                    content: chunk.text,
                    chunk_index: index,
                    chunk_tokens: chunk.tokens,
                    knowledge_type: knowledgeEntry.knowledge_type || 'general',
                    created_at: new Date().toISOString()
                }
            }));
            
            await this.qdrant.client.upsert(this.qdrant.collections.user_knowledge, {
                points: points
            });
            
            // Update Postgres with embedding info
            const embeddingId = `knowledge_${knowledgeId}_${Date.now()}`;
            await this.postgres.update(
                'user_knowledge',
                {
                    embedding_id: embeddingId,
                    embedding_hash: embedding_hash,
                    vector_indexed_at: new Date().toISOString()
                },
                { id: knowledgeId }
            );
            
            console.log(`[UserKnowledgeService] Vectorized knowledge ${knowledgeId} with ${embeddings.length} chunks`);
            
            return embeddingId;
            
        } catch (error) {
            console.error('[UserKnowledgeService] Failed to vectorize knowledge:', error);
            // Don't throw - vectorization failure shouldn't break knowledge saving
            return null;
        }
    }

    /**
     * Search user knowledge using vector similarity (with text fallback)
     */
    async searchUserKnowledge(userId, query, options = {}) {
        await this.ensureInitialized();
        const { limit = 5, threshold = 0.3 } = options;
        
        // Try vector search first if Qdrant is available
        if (this.qdrant.isAvailable()) {
            try {
                const queryEmbedding = await fastEmbedService.generateEmbedding(query);
                const searchResult = await this.qdrant.client.search(this.qdrant.collections.user_knowledge, {
                    vector: queryEmbedding,
                    filter: { must: [{ key: 'user_id', match: { value: userId } }] },
                    limit: limit * 2,
                    score_threshold: threshold,
                    with_payload: true
                });
                
                // Deduplicate results by knowledge_id
                const seen = new Set();
                const results = searchResult
                    .filter(hit => !seen.has(hit.payload.knowledge_id) && seen.add(hit.payload.knowledge_id))
                    .slice(0, limit)
                    .map(hit => ({
                        knowledge_id: hit.payload.knowledge_id,
                        title: hit.payload.title,
                        content: hit.payload.content,
                        similarity_score: hit.score,
                        knowledge_type: hit.payload.knowledge_type
                    }));
                
                return { success: true, results, total: results.length, search_type: 'vector' };
            } catch (error) {
                console.warn('[UserKnowledgeService] Vector search failed, falling back to text search:', error.message);
            }
        }
        
        // Fallback to text search
        try {
            const searchPattern = `%${query}%`;
            const results = await this.postgres.query(`
                SELECT id, title, content, knowledge_type,
                       ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $2)) as rank
                FROM user_knowledge 
                WHERE user_id = $1 AND is_active = true AND (title ILIKE $3 OR content ILIKE $3)
                ORDER BY rank DESC, created_at DESC LIMIT $4
            `, [userId, query, searchPattern, limit]);
            
            return {
                success: true,
                results: results.map(row => ({
                    knowledge_id: row.id,
                    title: row.title,
                    content: row.content.length > 500 ? row.content.substring(0, 500) + '...' : row.content,
                    similarity_score: row.rank,
                    knowledge_type: row.knowledge_type
                })),
                total: results.length,
                search_type: 'text'
            };
        } catch (error) {
            console.error('[UserKnowledgeService] Text search failed:', error);
            throw new Error(`Search failed: ${error.message}`);
        }
    }

}

// Export singleton instance
let userKnowledgeInstance = null;

export function getUserKnowledgeService() {
    if (!userKnowledgeInstance) {
        userKnowledgeInstance = new UserKnowledgeService();
    }
    return userKnowledgeInstance;
}

export { UserKnowledgeService };
export default UserKnowledgeService;