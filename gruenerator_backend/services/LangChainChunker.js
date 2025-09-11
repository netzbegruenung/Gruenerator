/**
 * LangChainChunker - Wrapper around LangChain's RecursiveCharacterTextSplitter
 * Provides German-optimized splitting and metadata enrichment.
 *
 * Graceful fallback: if langchain is not installed, falls back to
 * a simple paragraph splitter with overlap.
 */

const { vectorConfig } = require('../config/vectorConfig.js');
const {
  detectContentType,
  detectMarkdownStructure,
  extractPageNumber,
} = require('../utils/contentTypeDetector.js');
const { chunkQualityService } = require('./ChunkQualityService.js');
const { cleanTextForEmbedding } = require('../utils/textCleaning.js');

class LangChainChunker {
  constructor(options = {}) {
    const chunking = vectorConfig.get('chunking');
    this.chunkSize = options.chunkSize || chunking?.adaptive?.defaultSize || 400;
    this.chunkOverlap = options.chunkOverlap || chunking?.adaptive?.overlapSize || 100;
  }

  /**
   * Try to load LangChain's splitter dynamically
   * @private
   */
  async #getSplitter() {
    try {
      const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter');
      // fromLanguage supports 'german' for German-optimized separators
      const splitter = RecursiveCharacterTextSplitter.fromLanguage('german', {
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap,
      });
      return splitter;
    } catch (err) {
      if (vectorConfig.isVerboseMode()) {
        console.warn('[LangChainChunker] LangChain not available; using fallback splitter:', err.message);
      }
      return null;
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

    const chunks = rawChunks.map((t, i) => ({
      text: t.trim(),
      index: i,
      tokens: this.#estimateTokens(t),
      metadata: {
        chunkingMethod: splitter ? 'langchain' : 'fallback-paragraph',
        ...baseMetadata,
      }
    })).filter(c => c.text.length > 0);

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
      const pageNumber = extractPageNumber(c.text);
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
          page_number: pageNumber,
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
}

const langChainChunker = new LangChainChunker();

module.exports = {
  LangChainChunker,
  langChainChunker,
};
