/**
 * Embedding generation operations
 * Handles single, batch, and mock embedding generation
 */

import { validateText, validateTexts } from './validation.js';
import type MistralEmbeddingClient from '../MistralEmbeddingClient.js';

/**
 * Generate embeddings for a single text
 */
export async function generateSingleEmbedding(
  client: MistralEmbeddingClient,
  text: string
): Promise<number[]> {
  validateText(text);
  return await client.generateEmbedding(text);
}

/**
 * Generate embeddings for multiple texts in a batch
 */
export async function generateBatchEmbeddings(
  client: MistralEmbeddingClient,
  texts: string[],
  inputType: string = 'search_document'
): Promise<number[][]> {
  validateTexts(texts);

  console.log(`[FastEmbedService] Generating embeddings for ${texts.length} texts`);
  const startTime = Date.now();

  try {
    const embeddings = await client.generateBatchEmbeddings(texts);
    const duration = Date.now() - startTime;
    console.log(`[FastEmbedService] Successfully generated ${embeddings.length} embeddings in ${duration}ms`);
    return embeddings;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[FastEmbedService] Failed to generate embeddings after ${duration}ms:`, (error as Error).message);
    throw error;
  }
}

/**
 * Generate a deterministic mock embedding based on text hash
 * Used as fallback when embedding server is unavailable
 */
export function generateMockEmbedding(text: string, dimensions: number = 1024): number[] {
  const mockEmbedding = new Array(dimensions);

  // Simple hash function to generate consistent mock values
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate mock embedding values based on hash
  for (let i = 0; i < dimensions; i++) {
    mockEmbedding[i] = (Math.sin(hash + i) * 0.1); // Small values similar to real embeddings
  }

  return mockEmbedding;
}

/**
 * Generate mock embeddings for multiple texts
 */
export function generateMockBatchEmbeddings(texts: string[], dimensions: number = 1024): number[][] {
  return texts.map(text => generateMockEmbedding(text, dimensions));
}
