import { mistralEmbeddingService } from '../mistral/index.js';
import {
  smartChunkDocument,
  hierarchicalChunkDocument,
  estimateTokens,
} from '../document-services/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('BundestagProcessor');

/**
 * Crawled page data structure
 */
interface PageData {
  url: string;
  text: string;
  title?: string;
  section?: string;
  content_hash?: string;
  published_at?: string;
}

/**
 * Base metadata for chunks
 */
interface ChunkMetadata {
  url?: string;
  title?: string;
  section?: string;
  chunk_index?: number;
  total_chunks?: number;
  [key: string]: any;
}

/**
 * Text chunk with metadata
 */
interface TextChunk {
  text: string;
  chunk_index: number;
  token_count: number;
  metadata: ChunkMetadata;
  embedding?: number[] | null;
  embeddingError?: string;
}

/**
 * Processed page result
 */
interface ProcessedPage {
  url: string;
  title?: string;
  section?: string;
  content_hash?: string;
  published_at?: string;
  chunks: TextChunk[];
}

/**
 * Processing results
 */
interface ProcessingResults {
  processed: number;
  totalChunks: number;
  errors: Array<{ url: string; error: string }>;
  pages: ProcessedPage[];
}

/**
 * Progress callback data
 */
interface ProgressData {
  current: number;
  total: number;
  url: string;
  chunks: number;
}

/**
 * Processor options
 */
interface ProcessorOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  batchSize?: number;
}

/**
 * Bundestag Content Processor
 * Processes crawled web content for Qdrant indexing
 */
class BundestagContentProcessor {
  private chunkSize: number;
  private chunkOverlap: number;
  private batchSize: number;

  constructor(options: ProcessorOptions = {}) {
    this.chunkSize = options.chunkSize || 400; // tokens
    this.chunkOverlap = options.chunkOverlap || 50; // tokens
    this.batchSize = options.batchSize || 10; // embedding batch size
  }

  /**
   * Process a single crawled page and prepare chunks with embeddings
   * @param pageData - Crawled page data
   * @returns Array of chunks with embeddings
   */
  async processPage(pageData: PageData): Promise<TextChunk[]> {
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
        section,
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to process page ${url}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Process multiple pages
   * @param pages - Array of crawled page data
   * @param progressCallback - Optional progress callback
   * @returns Processing results
   */
  async processPages(
    pages: PageData[],
    progressCallback: ((data: ProgressData) => void) | null = null
  ): Promise<ProcessingResults> {
    const results: ProcessingResults = {
      processed: 0,
      totalChunks: 0,
      errors: [],
      pages: [],
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
          chunks: chunks,
        });

        results.processed++;
        results.totalChunks += chunks.length;

        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: pages.length,
            url: page.url,
            chunks: chunks.length,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({
          url: page.url,
          error: errorMessage,
        });
        log.error(`Error processing ${page.url}: ${errorMessage}`);
      }
    }

    return results;
  }

  /**
   * Clean text for processing
   * @param text - Raw text
   * @returns Cleaned text
   */
  private cleanText(text: string): string {
    if (!text) return '';

    return (
      text
        // Remove excessive whitespace
        .replace(/\s+/g, ' ')
        // Normalize line breaks
        .replace(/\n\s*\n/g, '\n\n')
        // Remove common boilerplate patterns
        .replace(/Cookie[s]?\s*(Policy|Einstellungen|Hinweis)/gi, '')
        .replace(/Datenschutzerklärung/gi, '')
        .replace(/Newsletter\s*abonnieren/gi, '')
        .replace(/Folgen?\s*Sie\s*uns/gi, '')
        .replace(/Teilen\s*(auf\s*)?(Facebook|Twitter|LinkedIn)/gi, '')
        // Remove footer/contact boilerplate
        .replace(/Nimm Kontakt mit uns auf/gi, '')
        .replace(/Bürger\*?innentelefon/gi, '')
        .replace(/Platz der Republik 1\s*11011 Berlin/gi, '')
        // Remove breadcrumb navigation text
        .replace(/Startseite\s*›[^.]+/gi, '')
        // Remove URLs
        .replace(/https?:\/\/[^\s]+/g, '')
        // Remove email addresses
        .replace(/[\w.-]+@[\w.-]+\.\w+/g, '')
        // Trim
        .trim()
    );
  }

  /**
   * Chunk text into smaller pieces
   * @param text - Text to chunk
   * @param metadata - Base metadata for chunks
   * @returns Array of chunk objects
   */
  private async chunkText(text: string, metadata: ChunkMetadata = {}): Promise<TextChunk[]> {
    try {
      // Use smartChunkDocument for intelligent chunking
      const chunks = await smartChunkDocument(text, {
        baseMetadata: metadata,
        maxTokens: this.chunkSize,
        overlapTokens: this.chunkOverlap,
      });

      if (Array.isArray(chunks) && chunks.length > 0) {
        return chunks.map(
          (chunk: any, index: number): TextChunk => ({
            text: chunk.text || chunk,
            chunk_index: index,
            token_count: chunk.tokens || estimateTokens(chunk.text || chunk),
            metadata: {
              ...metadata,
              ...chunk.metadata,
              chunk_index: index,
              total_chunks: chunks.length,
            },
          })
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.warn(`Smart chunking failed, using fallback: ${errorMessage}`);
    }

    // Fallback: use hierarchical chunking
    try {
      const chunks = hierarchicalChunkDocument(text, {
        maxTokens: this.chunkSize,
        overlapTokens: this.chunkOverlap,
      });

      if (Array.isArray(chunks) && chunks.length > 0) {
        return chunks.map(
          (chunk: any, index: number): TextChunk => ({
            text: chunk.text || chunk,
            chunk_index: index,
            token_count: chunk.tokens || estimateTokens(chunk.text || chunk),
            metadata: {
              ...metadata,
              chunk_index: index,
              total_chunks: chunks.length,
            },
          })
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.warn(`Hierarchical chunking failed, using simple split: ${errorMessage}`);
    }

    // Final fallback: simple splitting
    return this.simpleSplit(text, metadata);
  }

  /**
   * Simple text splitting fallback
   * @param text - Text to split
   * @param metadata - Base metadata
   * @returns Array of chunk objects
   */
  private simpleSplit(text: string, metadata: ChunkMetadata = {}): TextChunk[] {
    const chunks: TextChunk[] = [];
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
          metadata: { ...metadata, chunk_index: chunkIndex },
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
        metadata: { ...metadata, chunk_index: chunkIndex },
      });
    }

    // Update total_chunks in metadata
    return chunks.map((chunk) => ({
      ...chunk,
      metadata: { ...chunk.metadata, total_chunks: chunks.length },
    }));
  }

  /**
   * Get overlap text from end of chunk
   * @param text - Text to get overlap from
   * @returns Overlap text
   */
  private getOverlapText(text: string): string {
    const words = text.split(/\s+/);
    const overlapWords = Math.min(
      words.length,
      Math.ceil(this.chunkOverlap * 1.3) // Approximate words from tokens
    );
    return words.slice(-overlapWords).join(' ') + ' ';
  }

  /**
   * Generate embeddings for chunks in batches
   * @param chunks - Array of chunk objects
   * @returns Chunks with embeddings
   */
  private async generateEmbeddings(chunks: TextChunk[]): Promise<TextChunk[]> {
    const results: TextChunk[] = [];

    // Process in batches
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const texts = batch.map((chunk) => chunk.text);

      try {
        const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
          results.push({
            ...batch[j],
            embedding: embeddings[j],
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Embedding generation failed for batch ${i / this.batchSize}: ${errorMessage}`);

        // Skip failed batch but continue
        for (const chunk of batch) {
          results.push({
            ...chunk,
            embedding: null,
            embeddingError: errorMessage,
          });
        }
      }
    }

    // Filter out chunks without embeddings
    const validChunks = results.filter((chunk) => chunk.embedding !== null);

    if (validChunks.length < results.length) {
      log.warn(`${results.length - validChunks.length} chunks failed embedding generation`);
    }

    return validChunks;
  }
}

export {
  BundestagContentProcessor,
  type PageData,
  type ChunkMetadata,
  type TextChunk,
  type ProcessedPage,
  type ProcessingResults,
  type ProgressData,
  type ProcessorOptions,
};

export default BundestagContentProcessor;
