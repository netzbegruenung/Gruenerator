/**
 * Absatzweiser Splitter für den Fließtext-Pfad des Chunkers.
 *
 * Hiess bis 02.09.2026 `langchainIntegration.ts` und probierte drei
 * LangChain-Modulpfade durch (`getSplitter`). `@langchain/textsplitters` stand
 * in keinem Manifest, der Zweig war unerreichbar, und das Etikett
 * `chunkingMethod` behauptete trotzdem LangChain (#3135). Gelaufen ist immer
 * `fallbackSplit` — der steht jetzt allein da, unverändert.
 */

import { cleanTextForEmbedding } from '../../text/index.js';

import { estimateTokens } from './validation.js';

import type { Chunk, ParagraphChunkerOptions } from './types.js';

/**
 * Absatzweiser Chunker mit deutscher Satzbehandlung.
 */
export class ParagraphChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(options: ParagraphChunkerOptions = {}) {
    this.chunkSize = options.chunkSize || 1600;
    this.chunkOverlap = options.chunkOverlap || 400;
  }

  /**
   * Chunk document
   */
  async chunkDocument(text: string, baseMetadata: Record<string, unknown> = {}): Promise<Chunk[]> {
    if (!text || typeof text !== 'string') return [];

    const input = cleanTextForEmbedding(text);
    const rawChunks = this.fallbackSplit(input);

    let chunks = rawChunks
      .map((t, i) => ({
        text: t.trim(),
        index: i,
        tokens: estimateTokens(t),
        metadata: {
          chunkingMethod: 'paragraphs',
          ...baseMetadata,
        },
      }))
      .filter((c) => c.text.length > 0);

    // Post-process: merge very short chunks to improve context
    chunks = this.mergeSmallChunks(chunks, { minChars: 800, maxMergedChars: 2400 });

    return chunks;
  }

  /**
   * Fallback splitting strategy when LangChain is unavailable
   */
  private fallbackSplit(text: string): string[] {
    const paras = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const chunks: string[] = [];
    let buf = '';

    for (const p of paras) {
      if (estimateTokens(buf + '\n\n' + p) > this.chunkSize && buf) {
        chunks.push(buf);
        buf = p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) chunks.push(buf);

    // Add simple overlap
    const overlapped: string[] = [];
    const approxChars = Math.floor(this.chunkOverlap * 4);

    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        overlapped.push(chunks[i]);
      } else {
        overlapped.push(chunks[i - 1].slice(-approxChars) + '\n\n' + chunks[i]);
      }
    }

    return overlapped;
  }

  /**
   * Merge small chunks to improve context
   */
  private mergeSmallChunks<
    T extends { text: string; index: number; tokens: number; metadata: Record<string, unknown> },
  >(chunks: T[], { minChars = 800, maxMergedChars = 2400 } = {}): T[] {
    if (!Array.isArray(chunks) || chunks.length === 0) return chunks;

    const merged: T[] = [];
    let i = 0;

    while (i < chunks.length) {
      const cur = { ...chunks[i] };
      cur.metadata = cur.metadata || {};

      while (cur.text.length < minChars && i + 1 < chunks.length) {
        const next = chunks[i + 1];
        if (cur.text.length + 1 + next.text.length > maxMergedChars) break;

        const page = cur.metadata.page_number ?? next.metadata?.page_number ?? null;
        cur.text = `${cur.text}\n\n${(next.text || '').trim()}`.trim();
        cur.tokens = estimateTokens(cur.text);
        cur.metadata = { ...cur.metadata, page_number: page };
        i += 1;
      }

      merged.push(cur);
      i += 1;
    }

    return merged.map((c, idx) => ({ ...c, index: idx }));
  }
}
