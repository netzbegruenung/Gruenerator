/**
 * Chunk post-processing utilities
 * Handles sentence repacking, metadata enrichment, and overlap creation
 */

import { vectorConfig } from '../../../config/vectorConfig.js';
import {
  detectContentType,
  detectMarkdownStructure,
  extractPageNumber,
} from '../../content/index.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import {
  sentenceSegments,
  findPageMarkers,
  createSentenceOverlap,
  resolvePageNumberForOffset,
} from './sentenceSegmentation.js';
import { estimateTokens } from './validation.js';
import type { Chunk, SentenceSegment, PageMarker } from './types.js';

/**
 * Repack chunks into sentence-aligned chunks with proper overlap
 */
export function sentenceRepack(
  chunks: Chunk[],
  options: {
    baseMetadata?: Record<string, any>;
    targetChars?: number;
    overlapChars?: number;
    originalRawText?: string;
    pageRanges?: any[];
  } = {}
): Chunk[] {
  const {
    baseMetadata = {},
    targetChars = 1600,
    overlapChars = 400,
    originalRawText,
    pageRanges,
  } = options;

  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  // Concatenate texts in order; prefer page-aware metadata from first chunk
  const pageNum = chunks[0]?.metadata?.page_number ?? baseMetadata.page_number ?? null;
  const text = chunks
    .map((c) => c.text)
    .join(' ')
    .trim();
  const sentences = sentenceSegments(text);
  const markers = findPageMarkers(text);
  const results: any[] = [];

  let currentSentences: SentenceSegment[] = [];
  let currentLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceText = sentence.s;

    // Check if adding this sentence would exceed target
    const tentativeLength =
      currentLength + (currentSentences.length > 0 ? 1 : 0) + sentenceText.length;

    if (tentativeLength <= targetChars || currentSentences.length === 0) {
      // Add sentence to current chunk
      currentSentences.push(sentence);
      currentLength = tentativeLength;
    } else {
      // Finalize current chunk
      if (currentSentences.length > 0) {
        const chunkText = currentSentences
          .map((s) => s.s)
          .join(' ')
          .trim();
        const chunkStart = currentSentences[0].start;
        const chunkEnd = currentSentences[currentSentences.length - 1].end;
        const pn = resolvePageNumberForOffset(markers, pageNum, chunkStart);
        results.push({ text: chunkText, start: chunkStart, end: chunkEnd, page_number: pn });

        // Create overlap using complete sentences from the end
        const overlapResult = createSentenceOverlap(currentSentences, overlapChars);
        const overlapSentences = currentSentences.slice(-overlapResult.numSentences);
        currentSentences = [...overlapSentences, sentence];
        currentLength = currentSentences.map((s) => s.s).join(' ').length;
      } else {
        // Single sentence chunk
        currentSentences = [sentence];
        currentLength = sentenceText.length;
      }
    }
  }

  // Handle final chunk
  if (currentSentences.length > 0) {
    const chunkText = currentSentences
      .map((s) => s.s)
      .join(' ')
      .trim();
    const chunkStart = currentSentences[0].start;
    const chunkEnd = currentSentences[currentSentences.length - 1].end;
    const pn = resolvePageNumberForOffset(markers, pageNum, chunkStart);
    results.push({ text: chunkText, start: chunkStart, end: chunkEnd, page_number: pn });
  }

  // Map to chunk objects
  return results.map((r, i) => ({
    text: r.text,
    index: i,
    tokens: estimateTokens(r.text),
    metadata: {
      ...baseMetadata,
      chunkingMethod: 'langchain-sentences',
      page_number: r.page_number,
    },
  }));
}

/**
 * Enrich chunk with content metadata
 */
export function enrichChunkWithMetadata(
  chunk: Chunk,
  baseMetadata: Record<string, any> = {}
): Chunk {
  const contentType = detectContentType(chunk.text);
  const md = detectMarkdownStructure(chunk.text);
  const pageNumberDetected = extractPageNumber(chunk.text);
  const qualityCfg = vectorConfig.get('quality');
  const quality = qualityCfg.enabled
    ? chunkQualityService.calculateQualityScore(chunk.text, { contentType })
    : 1.0;

  return {
    ...chunk,
    metadata: {
      ...chunk.metadata,
      ...baseMetadata,
      content_type: contentType,
      markdown: {
        headers: md.headers?.length || 0,
        lists: md.lists || 0,
        tables: md.tables || 0,
        code_blocks: md.codeBlocks || 0,
      },
      // Prefer pre-set page_number (e.g., from page-splitting) over detection
      page_number:
        chunk.metadata && chunk.metadata.page_number != null
          ? chunk.metadata.page_number
          : pageNumberDetected,
      quality_score: Number.isFinite(quality) ? quality : 0,
    },
  };
}

/**
 * Create sliding windows for better context preservation
 */
export function createSlidingWindows(
  text: string,
  windowSize: number = 400,
  stepSize: number = 300
): Array<{ text: string; start: number; end: number }> {
  const words = text.split(/\s+/);
  const windows: Array<{ text: string; start: number; end: number }> = [];

  // Approximate tokens per word (rough estimate)
  const tokensPerWord = 1.3;
  const wordsPerWindow = Math.floor(windowSize / tokensPerWord);
  const wordsPerStep = Math.floor(stepSize / tokensPerWord);

  for (let i = 0; i < words.length; i += wordsPerStep) {
    const windowWords = words.slice(i, i + wordsPerWindow);

    if (windowWords.length > 10) {
      // Minimum meaningful window
      windows.push({
        text: windowWords.join(' '),
        start: i,
        end: Math.min(i + wordsPerWindow, words.length),
      });
    }

    // Stop if we've reached the end
    if (i + wordsPerWindow >= words.length) {
      break;
    }
  }

  return windows;
}
