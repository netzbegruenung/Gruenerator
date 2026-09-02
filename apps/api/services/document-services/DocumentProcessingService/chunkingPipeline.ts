/**
 * Chunking pipeline operations
 * Handles text chunking and embedding generation
 */

import { mistralEmbeddingService } from '../../mistral/index.js';
import { buildEmbeddingTextsForChunks } from '../embeddingText.js';
import { smartChunkDocument } from '../TextChunker/index.js';

import type { ChunkingOptions, ChunkAndEmbedResult } from './types.js';

/**
 * Process text content into chunks and embeddings
 */
export async function chunkAndEmbedText(
  text: string,
  options: ChunkingOptions = {}
): Promise<ChunkAndEmbedResult> {
  const { preserveSentences = true, title = null } = options;

  if (!text || text.trim().length === 0) {
    throw new Error('No text content provided');
  }

  const chunks = await smartChunkDocument(text, { preserveSentences });

  if (chunks.length === 0) {
    throw new Error('Text could not be processed into chunks');
  }

  const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
    buildEmbeddingTextsForChunks(chunks, title),
    'search_document'
  );

  return {
    chunks,
    embeddings,
    vectorCount: chunks.length,
  };
}
