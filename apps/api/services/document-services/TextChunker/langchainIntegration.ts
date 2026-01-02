/**
 * LangChain integration for text chunking
 * Handles RecursiveCharacterTextSplitter with fallback strategies
 */

import { vectorConfig } from '../../../config/vectorConfig.js';
import { cleanTextForEmbedding } from '../../text/index.js';
import { estimateTokens } from './validation.js';
import { GERMAN_SEPARATORS } from './germanLanguageRules.js';
import type { Chunk, ChunkingOptions, LangChainChunkerOptions } from './types.js';

/**
 * LangChain-based chunker implementation
 * Provides intelligent text splitting with German language support
 */
export class LangChainChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(options: LangChainChunkerOptions = {}) {
    const chunking = vectorConfig.get('chunking');
    this.chunkSize = options.chunkSize || 1600 || chunking?.adaptive?.defaultSize;
    this.chunkOverlap = options.chunkOverlap || 400 || chunking?.adaptive?.overlapSize;
  }

  /**
   * Get LangChain text splitter with fallback strategies
   */
  private async getSplitter(): Promise<any | null> {
    const opts = {
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      separators: GERMAN_SEPARATORS
    };

    try {
      // @ts-ignore - LangChain is an optional dependency
      const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter');
      return new RecursiveCharacterTextSplitter(opts);
    } catch (err1) {
      try {
        // @ts-ignore - LangChain is an optional dependency
        const { RecursiveCharacterTextSplitter } = await import('@langchain/core/text_splitter');
        return new RecursiveCharacterTextSplitter(opts);
      } catch (err2) {
        try {
          // @ts-ignore - LangChain is an optional dependency
          const { RecursiveCharacterTextSplitter } = await import('@langchain/textsplitters');
          return new RecursiveCharacterTextSplitter(opts);
        } catch (err3) {
          if (vectorConfig.isVerboseMode()) {
            console.warn('[LangChainChunker] LangChain not available; using fallback');
          }
          return null;
        }
      }
    }
  }

  /**
   * Chunk document using LangChain or fallback
   */
  async chunkDocument(text: string, baseMetadata: Record<string, any> = {}): Promise<Chunk[]> {
    if (!text || typeof text !== 'string') return [];

    const input = cleanTextForEmbedding(text);

    const splitter = await this.getSplitter();
    let rawChunks: string[];

    if (splitter && typeof splitter.splitText === 'function') {
      rawChunks = await splitter.splitText(input);
    } else {
      rawChunks = this.fallbackSplit(input);
    }

    let chunks = rawChunks.map((t, i) => ({
      text: t.trim(),
      index: i,
      tokens: estimateTokens(t),
      metadata: {
        chunkingMethod: splitter ? 'langchain' : 'fallback-paragraph',
        ...baseMetadata,
      }
    })).filter(c => c.text.length > 0);

    // Post-process: merge very short chunks to improve context
    chunks = this.mergeSmallChunks(chunks, { minChars: 800, maxMergedChars: 2400 });

    return chunks;
  }

  /**
   * Fallback splitting strategy when LangChain is unavailable
   */
  private fallbackSplit(text: string): string[] {
    const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
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
  private mergeSmallChunks<T extends { text: string; index: number; tokens: number; metadata: any }>(
    chunks: T[],
    { minChars = 800, maxMergedChars = 2400 } = {}
  ): T[] {
    if (!Array.isArray(chunks) || chunks.length === 0) return chunks;

    const merged: T[] = [];
    let i = 0;

    while (i < chunks.length) {
      let cur = { ...chunks[i] };
      cur.metadata = cur.metadata || {};

      while (cur.text.length < minChars && i + 1 < chunks.length) {
        const next = chunks[i + 1];
        if ((cur.text.length + 1 + next.text.length) > maxMergedChars) break;

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

/**
 * Create singleton instance
 */
export const langChainChunker = new LangChainChunker();
