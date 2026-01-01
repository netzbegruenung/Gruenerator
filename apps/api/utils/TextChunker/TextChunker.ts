/**
 * Main text chunking orchestration
 * Provides smart chunking with page markers, sentence alignment, and structure awareness
 */

import { cleanTextForEmbedding } from '../textCleaning.js';
import { LangChainChunker } from './langchainIntegration.js';
import { hierarchicalChunkDocument } from './structureAwareChunking.js';
import { splitTextByPageMarkers, buildPageRangesFromRaw } from './pageMarkerProcessing.js';
import { sentenceRepack, enrichChunkWithMetadata } from './chunkPostProcessing.js';
import type { Chunk, ChunkingOptions } from './types.js';

/**
 * Chunk a document intelligently based on its structure
 * Main entry point for document chunking
 */
export async function smartChunkDocument(
  text: string,
  options: ChunkingOptions = {}
): Promise<Chunk[]> {
  const { baseMetadata = {} } = options;

  // STEP 1: Detect page markers BEFORE any text cleaning
  // Use raw text to find page markers reliably
  const pages = splitTextByPageMarkers(text);

  try {
    const langChainChunker = new LangChainChunker();

    let all: Chunk[] = [];
    if (pages.length === 0) {
      // No pages detected - process entire document
      // Build page ranges from raw text before cleaning
      const pageRanges = buildPageRangesFromRaw(text);
      // Now clean the text for processing
      const cleaned = cleanTextForEmbedding(text);
      const chunks = await langChainChunker.chunkDocument(cleaned, baseMetadata);
      all = sentenceRepack(chunks, { baseMetadata, originalRawText: text, pageRanges });
    } else {
      // Process each page separately
      for (const p of pages) {
        const pageMeta = { ...baseMetadata, page_number: p.pageNumber };
        // Clean each page's text separately (preserving structure initially)
        const pageText = cleanTextForEmbedding(p.textWithoutMarker);
        const chunks = await langChainChunker.chunkDocument(pageText, pageMeta);
        const repacked = sentenceRepack(chunks, { baseMetadata: pageMeta });
        // Ensure page_number is set on every chunk (prefer explicit over detection)
        all.push(...repacked.map(c => ({
          ...c,
          metadata: { ...c.metadata, page_number: p.pageNumber }
        })));
      }
    }

    // Reindex chunks globally and enrich metadata
    return all.map((c, i) => enrichChunkWithMetadata({ ...c, index: i }, baseMetadata));
  } catch (e) {
    // Minimal safety fallback to avoid hard failure if LangChain is unavailable
    const { maxTokens = 600, overlapTokens = 150 } = options;
    const cleaned = cleanTextForEmbedding(text);
    const chunks = hierarchicalChunkDocument(cleaned, { maxTokens, overlapTokens });
    return chunks.map(c => enrichChunkWithMetadata(c, baseMetadata));
  }
}

/**
 * Async version of smartChunkDocument (for backward compatibility)
 * Delegates to the main smartChunkDocument function
 */
export async function smartChunkDocumentAsync(
  text: string,
  options: ChunkingOptions = {}
): Promise<Chunk[]> {
  return smartChunkDocument(text, options);
}
