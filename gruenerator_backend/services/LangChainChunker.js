/**
 * LangChainChunker - Wrapper around LangChain's RecursiveCharacterTextSplitter
 * Provides German-optimized splitting and metadata enrichment.
 *
 * Default behavior uses LangChain; a minimal paragraph fallback is kept
 * only to avoid hard failures if the dependency is unavailable at runtime.
 */

import { vectorConfig } from '../config/vectorConfig.js';
import {
  detectContentType,
  detectMarkdownStructure,
  extractPageNumber,
} from '../utils/contentTypeDetector.js';
import { chunkQualityService } from './ChunkQualityService.js';
import { cleanTextForEmbedding } from '../utils/textCleaning.js';

class LangChainChunker {
  constructor(options = {}) {
    const chunking = vectorConfig.get('chunking');
    // Policy documents benefit from ~400 tokens ≈ ~1600 chars and ~100 tokens overlap ≈ ~400 chars
    this.chunkSize = options.chunkSize || 1600 || chunking?.adaptive?.defaultSize;
    this.chunkOverlap = options.chunkOverlap || 400 || chunking?.adaptive?.overlapSize;
  }

  /**
   * Try to load LangChain's splitter dynamically
   * @private
   */
  async #getSplitter() {
    const opts = {
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      // Prefer sentence-ish boundaries, then paragraphs/newlines, then spaces
      separators: ['\n\n', '. ', '? ', '! ', '; ', ': ', '\n', ' ']
    };
    try {
      const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter');
      const splitter = new RecursiveCharacterTextSplitter(opts);
      return splitter;
    } catch (err1) {
      // Try alternate import paths for newer versions
      try {
        const { RecursiveCharacterTextSplitter } = await import('@langchain/core/text_splitter');
        const splitter = new RecursiveCharacterTextSplitter(opts);
        return splitter;
      } catch (err2) {
        try {
          const { RecursiveCharacterTextSplitter } = await import('@langchain/textsplitters');
          const splitter = new RecursiveCharacterTextSplitter(opts);
          return splitter;
        } catch (err3) {
          if (vectorConfig.isVerboseMode()) {
            console.warn('[LangChainChunker] LangChain not available; using fallback splitter:', (err1 && err1.message) || (err2 && err2.message) || (err3 && err3.message));
          }
          return null;
        }
      }
    }
  }

  /**
   * Split text into chunks, enrich with metadata and quality
   * @param {string} text
   * @param {object} baseMetadata
   * @returns {Promise<Array<{text:string,index:number,tokens:number,metadata:object}>>}
   */
  async chunkDocument(text, baseMetadata = {}) {
    if (!text || typeof text !== 'string') return [];
    const input = cleanTextForEmbedding(text);

    const splitter = await this.#getSplitter();
    let rawChunks;
    if (splitter && typeof splitter.splitText === 'function') {
      rawChunks = await splitter.splitText(input);
    } else {
      rawChunks = this.#fallbackSplit(input);
    }

    // Initial chunk objects
    let chunks = rawChunks.map((t, i) => ({
      text: t.trim(),
      index: i,
      tokens: this.#estimateTokens(t),
      metadata: {
        chunkingMethod: splitter ? 'langchain' : 'fallback-paragraph',
        ...baseMetadata,
      }
    })).filter(c => c.text.length > 0);

    // Post-process: merge very short chunks to improve context
    chunks = this.#mergeSmallChunks(chunks, { minChars: 800, maxMergedChars: 2400 });

    return this.enrichChunksWithMetadata(chunks);
  }

  /**
   * Add content type, markdown structure and quality score
   * @param {Array} chunks
   * @returns {Array}
   */
  enrichChunksWithMetadata(chunks) {
    const qualityCfg = vectorConfig.get('quality');
    const enriched = chunks.map(c => {
      const contentType = detectContentType(c.text);
      const md = detectMarkdownStructure(c.text);
      const pageNumberDetected = extractPageNumber(c.text);
      const quality = qualityCfg.enabled
        ? chunkQualityService.calculateQualityScore(c.text, { contentType })
        : 1.0;
      return {
        ...c,
        metadata: {
          ...c.metadata,
          content_type: contentType,
          markdown: {
            headers: md.headers?.length || 0,
            lists: md.lists || 0,
            tables: md.tables || 0,
            code_blocks: md.codeBlocks || 0,
            blockquotes: !!md.blockquotes,
          },
          // Prefer pre-set page_number (e.g., from page-splitting) over detection
          page_number: (c.metadata && c.metadata.page_number != null) ? c.metadata.page_number : pageNumberDetected,
          quality_score: Number.isFinite(quality) ? quality : 0,
        }
      };
    });
    return enriched;
  }

  /**
   * Configure a German-optimized splitter (exposed for tests)
   */
  async createGermanSplitter() {
    return this.#getSplitter();
  }

  // ----- helpers -----

  #fallbackSplit(text) {
    // Split by double newlines (paragraphs); then merge to approx size
    const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const chunks = [];
    let buf = '';
    for (const p of paras) {
      if (this.#estimateTokens(buf + '\n\n' + p) > this.chunkSize && buf) {
        chunks.push(buf);
        buf = p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) chunks.push(buf);

    // Add simple overlap by prefixing last N chars of previous chunk
    const overlapped = [];
    const approxChars = Math.floor(this.chunkOverlap * 4); // inverse of estimate
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) overlapped.push(chunks[i]);
      else overlapped.push(chunks[i - 1].slice(-approxChars) + '\n\n' + chunks[i]);
    }
    return overlapped;
  }

  #estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  #mergeSmallChunks(chunks, { minChars = 800, maxMergedChars = 2400 } = {}) {
    if (!Array.isArray(chunks) || chunks.length === 0) return chunks;
    const merged = [];
    let i = 0;
    while (i < chunks.length) {
      let cur = { ...chunks[i] };
      // Ensure metadata exists
      cur.metadata = cur.metadata || {};
      while (cur.text.length < minChars && i + 1 < chunks.length) {
        const next = chunks[i + 1];
        // Stop if merging would overshoot too much
        if ((cur.text.length + 1 + next.text.length) > maxMergedChars) break;
        // Merge, preferring existing page_number
        const page = cur.metadata.page_number ?? next.metadata?.page_number ?? null;
        cur.text = `${cur.text}\n\n${(next.text || '').trim()}`.trim();
        cur.tokens = this.#estimateTokens(cur.text);
        cur.metadata = { ...cur.metadata, page_number: page };
        i += 1;
      }
      merged.push(cur);
      i += 1;
    }
    // Reindex
    return merged.map((c, idx) => ({ ...c, index: idx }));
  }
}

export const langChainChunker = new LangChainChunker();
export { LangChainChunker };
