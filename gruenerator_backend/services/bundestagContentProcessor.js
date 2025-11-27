import { fastEmbedService } from './FastEmbedService.js';
import { smartChunkDocument, hierarchicalChunkDocument, estimateTokens } from '../utils/textChunker.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('BundestagProcessor');

/**
 * Bundestag Content Processor
 * Processes crawled web content for Qdrant indexing
 */
class BundestagContentProcessor {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 400; // tokens
        this.chunkOverlap = options.chunkOverlap || 50; // tokens
        this.batchSize = options.batchSize || 10; // embedding batch size
    }

    /**
     * Process a single crawled page and prepare chunks with embeddings
     * @param {Object} pageData - Crawled page data
     * @returns {Promise<Array>} Array of chunks with embeddings
     */
    async processPage(pageData) {
        const { url, text, title, section, content_hash } = pageData;

        if (!text || text.trim().length < 50) {
            log.debug(`Skipping page with insufficient content: ${url}`);
            return [];
        }

        log.debug(`Processing page: ${url} (${text.length} chars)`);

        try {
            // Clean and prepare text
            const cleanedText = this.cleanText(text);

            // Chunk the text
            const chunks = await this.chunkText(cleanedText, {
                title,
                url,
                section
            });

            if (chunks.length === 0) {
                log.debug(`No chunks generated for: ${url}`);
                return [];
            }

            // Generate embeddings in batches
            const chunksWithEmbeddings = await this.generateEmbeddings(chunks);

            log.info(`Processed ${url}: ${chunksWithEmbeddings.length} chunks`);

            return chunksWithEmbeddings;

        } catch (error) {
            log.error(`Failed to process page ${url}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process multiple pages
     * @param {Array} pages - Array of crawled page data
     * @param {Function} progressCallback - Optional progress callback
     * @returns {Promise<Object>} Processing results
     */
    async processPages(pages, progressCallback = null) {
        const results = {
            processed: 0,
            totalChunks: 0,
            errors: [],
            pages: []
        };

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];

            try {
                const chunks = await this.processPage(page);

                results.pages.push({
                    url: page.url,
                    title: page.title,
                    section: page.section,
                    content_hash: page.content_hash,
                    published_at: page.published_at,
                    chunks: chunks
                });

                results.processed++;
                results.totalChunks += chunks.length;

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: pages.length,
                        url: page.url,
                        chunks: chunks.length
                    });
                }

            } catch (error) {
                results.errors.push({
                    url: page.url,
                    error: error.message
                });
                log.error(`Error processing ${page.url}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Clean text for processing
     * @param {string} text - Raw text
     * @returns {string} Cleaned text
     */
    cleanText(text) {
        if (!text) return '';

        return text
            // Remove excessive whitespace
            .replace(/\s+/g, ' ')
            // Normalize line breaks
            .replace(/\n\s*\n/g, '\n\n')
            // Remove common boilerplate patterns
            .replace(/Cookie[s]?\s*(Policy|Einstellungen|Hinweis)/gi, '')
            .replace(/Datenschutzerkl\u00E4rung/gi, '')  // Only remove "Datenschutzerklärung", not "Datenschutz" alone
            .replace(/Newsletter\s*abonnieren/gi, '')
            .replace(/Folgen?\s*Sie\s*uns/gi, '')
            .replace(/Teilen\s*(auf\s*)?(Facebook|Twitter|LinkedIn)/gi, '')
            // Remove footer/contact boilerplate
            .replace(/Nimm Kontakt mit uns auf/gi, '')
            .replace(/B[üu]rger\*?innentelefon/gi, '')
            .replace(/Platz der Republik 1\s*11011 Berlin/gi, '')
            // Remove breadcrumb navigation text
            .replace(/Startseite\s*›[^.]+/gi, '')
            // Remove URLs
            .replace(/https?:\/\/[^\s]+/g, '')
            // Remove email addresses
            .replace(/[\w.-]+@[\w.-]+\.\w+/g, '')
            // Trim
            .trim();
    }

    /**
     * Chunk text into smaller pieces
     * @param {string} text - Text to chunk
     * @param {Object} metadata - Base metadata for chunks
     * @returns {Promise<Array>} Array of chunk objects
     */
    async chunkText(text, metadata = {}) {
        try {
            // Use smartChunkDocument for intelligent chunking
            const chunks = await smartChunkDocument(text, {
                baseMetadata: metadata,
                maxTokens: this.chunkSize,
                overlapTokens: this.chunkOverlap
            });

            if (Array.isArray(chunks) && chunks.length > 0) {
                return chunks.map((chunk, index) => ({
                    text: chunk.text || chunk,
                    chunk_index: index,
                    token_count: chunk.tokens || estimateTokens(chunk.text || chunk),
                    metadata: {
                        ...metadata,
                        ...chunk.metadata,
                        chunk_index: index,
                        total_chunks: chunks.length
                    }
                }));
            }
        } catch (error) {
            log.warn(`Smart chunking failed, using fallback: ${error.message}`);
        }

        // Fallback: use hierarchical chunking
        try {
            const chunks = hierarchicalChunkDocument(text, {
                maxTokens: this.chunkSize,
                overlapTokens: this.chunkOverlap
            });

            if (Array.isArray(chunks) && chunks.length > 0) {
                return chunks.map((chunk, index) => ({
                    text: chunk.text || chunk,
                    chunk_index: index,
                    token_count: chunk.tokens || estimateTokens(chunk.text || chunk),
                    metadata: {
                        ...metadata,
                        chunk_index: index,
                        total_chunks: chunks.length
                    }
                }));
            }
        } catch (error) {
            log.warn(`Hierarchical chunking failed, using simple split: ${error.message}`);
        }

        // Final fallback: simple splitting
        return this.simpleSplit(text, metadata);
    }

    /**
     * Simple text splitting fallback
     * @param {string} text - Text to split
     * @param {Object} metadata - Base metadata
     * @returns {Array} Array of chunk objects
     */
    simpleSplit(text, metadata = {}) {
        const chunks = [];
        const sentences = text.split(/(?<=[.!?])\s+/);
        let currentChunk = '';
        let chunkIndex = 0;

        for (const sentence of sentences) {
            const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

            if (estimateTokens(testChunk) > this.chunkSize && currentChunk) {
                chunks.push({
                    text: currentChunk.trim(),
                    chunk_index: chunkIndex,
                    token_count: estimateTokens(currentChunk),
                    metadata: { ...metadata, chunk_index: chunkIndex }
                });
                chunkIndex++;

                // Start new chunk with overlap from previous
                const overlapText = this.getOverlapText(currentChunk);
                currentChunk = overlapText + sentence;
            } else {
                currentChunk = testChunk;
            }
        }

        // Add final chunk
        if (currentChunk.trim()) {
            chunks.push({
                text: currentChunk.trim(),
                chunk_index: chunkIndex,
                token_count: estimateTokens(currentChunk),
                metadata: { ...metadata, chunk_index: chunkIndex }
            });
        }

        // Update total_chunks in metadata
        return chunks.map(chunk => ({
            ...chunk,
            metadata: { ...chunk.metadata, total_chunks: chunks.length }
        }));
    }

    /**
     * Get overlap text from end of chunk
     * @param {string} text - Text to get overlap from
     * @returns {string} Overlap text
     */
    getOverlapText(text) {
        const words = text.split(/\s+/);
        const overlapWords = Math.min(
            words.length,
            Math.ceil(this.chunkOverlap * 1.3) // Approximate words from tokens
        );
        return words.slice(-overlapWords).join(' ') + ' ';
    }

    /**
     * Estimate token count
     * @param {string} text - Text to estimate
     * @returns {number} Estimated token count
     */
    estimateTokensLocal(text) {
        if (!text) return 0;
        // Use imported estimateTokens or fallback
        return estimateTokens(text);
    }

    /**
     * Generate embeddings for chunks in batches
     * @param {Array} chunks - Array of chunk objects
     * @returns {Promise<Array>} Chunks with embeddings
     */
    async generateEmbeddings(chunks) {
        const results = [];

        // Process in batches
        for (let i = 0; i < chunks.length; i += this.batchSize) {
            const batch = chunks.slice(i, i + this.batchSize);
            const texts = batch.map(chunk => chunk.text);

            try {
                const embeddings = await fastEmbedService.generateBatchEmbeddings(texts);

                for (let j = 0; j < batch.length; j++) {
                    results.push({
                        ...batch[j],
                        embedding: embeddings[j]
                    });
                }

            } catch (error) {
                log.error(`Embedding generation failed for batch ${i / this.batchSize}: ${error.message}`);

                // Skip failed batch but continue
                for (const chunk of batch) {
                    results.push({
                        ...chunk,
                        embedding: null,
                        embeddingError: error.message
                    });
                }
            }
        }

        // Filter out chunks without embeddings
        const validChunks = results.filter(chunk => chunk.embedding !== null);

        if (validChunks.length < results.length) {
            log.warn(`${results.length - validChunks.length} chunks failed embedding generation`);
        }

        return validChunks;
    }
}

export { BundestagContentProcessor };
export default BundestagContentProcessor;
