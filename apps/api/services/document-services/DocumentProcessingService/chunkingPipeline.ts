/**
 * Chunking pipeline operations
 * Handles text chunking and embedding generation
 */

import { mistralEmbeddingService } from '../../mistral/index.js';
import { smartChunkDocument } from '../TextChunker/index.js';
import type { ChunkingOptions, ChunkAndEmbedResult } from './types.js';

/**
 * Process text content into chunks and embeddings
 */
export async function chunkAndEmbedText(
  text: string,
  options: ChunkingOptions = {}
): Promise<ChunkAndEmbedResult> {
  const {
    maxTokens = 400,
    overlapTokens = 50,
    preserveSentences = true
  } = options;

  if (!text || text.trim().length === 0) {
    throw new Error('No text content provided');
  }

  const chunks = await smartChunkDocument(text, {
    maxTokens,
    overlapTokens,
    preserveSentences
  });

  if (chunks.length === 0) {
    throw new Error('Text could not be processed into chunks');
  }

  const texts = chunks.map((chunk: any) => chunk.text);
  const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(texts, 'search_document');

  return {
    chunks,
    embeddings,
    vectorCount: chunks.length
  };
}
