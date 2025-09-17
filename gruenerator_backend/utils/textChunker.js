/**
 * Unified text chunking utility for document processing
 * Splits documents into chunks suitable for embedding generation
 * Enhanced with hierarchical structure detection and LangChain integration
 * Merged LangChainChunker functionality for better maintainability
 */

import { documentStructureDetector } from '../services/documentStructureDetector.js';
import { vectorConfig } from '../config/vectorConfig.js';
import { detectContentType, detectMarkdownStructure, extractPageNumber } from './contentTypeDetector.js';
import { chunkQualityService } from '../services/ChunkQualityService.js';
import { cleanTextForEmbedding } from './textCleaning.js';




/**
 * Estimate token count for text
 * Uses rough heuristic: 1 token ≈ 4 characters for multilingual text
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  
  // For German and multilingual text, use conservative estimate
  // Cohere's tokenizer typically uses ~1 token per 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Create overlapping windows for better context preservation
 * @param {string} text - Text to create windows from
 * @param {number} windowSize - Size of each window in tokens
 * @param {number} stepSize - Step size between windows in tokens
 * @returns {Array<{text: string, start: number, end: number}>} Array of text windows
 */
export function createSlidingWindows(text, windowSize = 400, stepSize = 300) {
  const words = text.split(/\s+/);
  const windows = [];
  
  // Approximate tokens per word (rough estimate)
  const tokensPerWord = 1.3;
  const wordsPerWindow = Math.floor(windowSize / tokensPerWord);
  const wordsPerStep = Math.floor(stepSize / tokensPerWord);
  
  for (let i = 0; i < words.length; i += wordsPerStep) {
    const windowWords = words.slice(i, i + wordsPerWindow);
    
    if (windowWords.length > 10) { // Minimum meaningful window
      windows.push({
        text: windowWords.join(' '),
        start: i,
        end: Math.min(i + wordsPerWindow, words.length)
      });
    }
    
    // Stop if we've reached the end
    if (i + wordsPerWindow >= words.length) {
      break;
    }
  }
  
  return windows;
}

/**
 * Prepare text for embedding by cleaning and normalizing
 * @param {string} text - Text to prepare
 * @returns {string} Cleaned text
 */
export function prepareTextForEmbedding(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?;:'"äöüÄÖÜß-]/g, '') // Keep only relevant characters
    .trim();
}

/**
 * LangChain-based chunker implementation
 * Integrated into textChunker for better maintainability
 * @private
 */
class LangChainChunker {
  constructor(options = {}) {
    const chunking = vectorConfig.get('chunking');
    this.chunkSize = options.chunkSize || 1600 || chunking?.adaptive?.defaultSize;
    this.chunkOverlap = options.chunkOverlap || 400 || chunking?.adaptive?.overlapSize;
  }

  async #getSplitter() {
    const opts = {
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      // Enhanced German-aware separators
      separators: ['\n\n', '. ', '? ', '! ', '; ', ': ', ', ', '\n', ' ']
    };
    try {
      const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter');
      return new RecursiveCharacterTextSplitter(opts);
    } catch (err1) {
      try {
        const { RecursiveCharacterTextSplitter } = await import('@langchain/core/text_splitter');
        return new RecursiveCharacterTextSplitter(opts);
      } catch (err2) {
        try {
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
    return chunks;
  }

  #fallbackSplit(text) {
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

    // Add simple overlap
    const overlapped = [];
    const approxChars = Math.floor(this.chunkOverlap * 4);
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
      cur.metadata = cur.metadata || {};
      while (cur.text.length < minChars && i + 1 < chunks.length) {
        const next = chunks[i + 1];
        if ((cur.text.length + 1 + next.text.length) > maxMergedChars) break;
        const page = cur.metadata.page_number ?? next.metadata?.page_number ?? null;
        cur.text = `${cur.text}\n\n${(next.text || '').trim()}`.trim();
        cur.tokens = this.#estimateTokens(cur.text);
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
 * Chunk a document intelligently based on its structure
 * @param {string} text - Document text
 * @param {Object} options - Chunking options
 * @returns {Array<{text: string, index: number, tokens: number, metadata: Object}>} Chunks
 */
export async function smartChunkDocument(text, options = {}) {
  const { baseMetadata = {} } = options;

  // STEP 1: Detect page markers BEFORE any text cleaning
  // Use raw text to find page markers reliably
  const pages = splitTextByPageMarkers(text);

  try {
    const langChainChunker = new LangChainChunker();

    let all = [];
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
        const pageText = cleanTextForEmbedding(p.textWithoutMarker, false);
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

function splitTextByPageMarkers(text) {
  // Match page markers anywhere; robust even if line breaks were collapsed
  const regex = /##\s*Seite\s+(\d+)/gi;
  const pages = [];
  let match;
  let lastIndex = 0;
  let lastPageNum = null;

  const markers = [];
  while ((match = regex.exec(text)) !== null) {
    markers.push({ page: parseInt(match[1], 10), index: match.index, length: match[0].length });
  }
  if (markers.length === 0) return [];

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const nextStart = (i + 1 < markers.length) ? markers[i + 1].index : text.length;
    const segment = text.slice(m.index + m.length, nextStart);
    pages.push({ pageNumber: m.page, textWithoutMarker: segment.trim() });
  }
  return pages;
}

function buildPageRangesFromRaw(text) {
  const ranges = [];
  if (!text) return ranges;
  const re = /##\s*Seite\s+(\d+)/gi;
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({ page: parseInt(m[1], 10), index: m.index, length: m[0].length });
  }
  if (matches.length === 0) return ranges;
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
    ranges.push({ page: matches[i].page, start, end });
  }
  return ranges;
}

function sentenceSegments(text) {
  const segments = [];
  if (!text) return segments;

  // Normalize line breaks but preserve paragraph structure
  const normalized = text.replace(/\n+/g, ' ').trim();

  // German abbreviations that should NOT end sentences
  const germanAbbreviations = new Set([
    'bzw', 'z.b', 'z.B', 'etc', 'usw', 'ggf', 'ca', 'Prof', 'Dr', 'Hr', 'Fr',
    'Abs', 'Art', 'Nr', 'Tel', 'Fax', 'E-Mail', 'e.V', 'GmbH', 'AG', 'Ltd',
    'Inc', 'Co', 'Corp', 'kg', 'mg', 'km', 'cm', 'mm', 'm²', 'qm', 'min',
    'max', 'zzgl', 'inkl', 'exkl', 'evtl', 'i.d.R', 'u.a', 'o.ä', 'o.g',
    'sog', 'bzw', 'ggf', 'z.T', 'z.Z', 'z.Zt'
  ]);

  // Split into potential sentences using multiple delimiters
  const potentialSentences = normalized.split(/([.!?]+)(?=\s|$)/);

  let currentSentence = '';
  let currentStart = 0;

  for (let i = 0; i < potentialSentences.length; i++) {
    const part = potentialSentences[i];

    if (!part) continue;

    if (/^[.!?]+$/.test(part)) {
      // This is punctuation - check if it's a real sentence end
      currentSentence += part;

      // Look ahead to see what follows
      const nextPart = potentialSentences[i + 1];
      const afterPunctuation = nextPart ? nextPart.trim() : '';

      // Check if this might be an abbreviation
      const beforePunctuation = currentSentence.slice(0, -part.length).trim();
      const lastWord = beforePunctuation.split(/\s+/).pop() || '';

      // Decide if this is a real sentence boundary
      const isAbbreviation = germanAbbreviations.has(lastWord) ||
                           germanAbbreviations.has(lastWord.replace(/\./g, ''));
      const nextStartsWithLower = afterPunctuation && /^[a-zäöüß]/.test(afterPunctuation);
      const isRealSentenceEnd = !isAbbreviation &&
                               (!afterPunctuation || /^[A-ZÄÖÜ0-9„(]/.test(afterPunctuation));

      if (isRealSentenceEnd || i === potentialSentences.length - 1) {
        // End current sentence
        const sentence = currentSentence.trim();
        if (sentence) {
          segments.push({
            s: sentence,
            start: currentStart,
            end: currentStart + sentence.length
          });
        }

        // Start new sentence
        currentStart += currentSentence.length;
        if (nextPart) {
          currentStart += nextPart.match(/^\s*/)?.[0]?.length || 0;
        }
        currentSentence = '';
      }
    } else {
      // Regular text part
      if (currentSentence === '') {
        currentStart = normalized.indexOf(part, currentStart);
      }
      currentSentence += part;
    }
  }

  // Handle any remaining text
  if (currentSentence.trim()) {
    segments.push({
      s: currentSentence.trim(),
      start: currentStart,
      end: currentStart + currentSentence.length
    });
  }

  return segments;
}

function findPageMarkers(text) {
  const markers = [];
  if (!text) return markers;
  const re = /##\s*Seite\s+(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const page = parseInt(m[1], 10);
    markers.push({ page, index: m.index });
  }
  return markers;
}

function sentenceRepack(chunks, { baseMetadata = {}, targetChars = 1600, overlapChars = 400 } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];
  // Concatenate texts in order; prefer page-aware metadata from first chunk
  const pageNum = chunks[0]?.metadata?.page_number ?? baseMetadata.page_number ?? null;
  const text = chunks.map(c => c.text).join(' ').trim();
  const sentences = sentenceSegments(text);
  const markers = findPageMarkers(text);
  const results = [];

  let currentSentences = [];
  let currentLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceText = sentence.s;

    // Check if adding this sentence would exceed target
    const tentativeLength = currentLength + (currentSentences.length > 0 ? 1 : 0) + sentenceText.length;

    if (tentativeLength <= targetChars || currentSentences.length === 0) {
      // Add sentence to current chunk
      currentSentences.push(sentence);
      currentLength = tentativeLength;
    } else {
      // Finalize current chunk
      if (currentSentences.length > 0) {
        const chunkText = currentSentences.map(s => s.s).join(' ').trim();
        const chunkStart = currentSentences[0].start;
        const chunkEnd = currentSentences[currentSentences.length - 1].end;
        const pn = resolvePageNumberForOffset(markers, pageNum, chunkStart);
        results.push({ text: chunkText, start: chunkStart, end: chunkEnd, page_number: pn });

        // Create overlap using complete sentences from the end
        const overlapSentences = createSentenceOverlap(currentSentences, overlapChars);
        currentSentences = [...overlapSentences, sentence];
        currentLength = currentSentences.map(s => s.s).join(' ').length;
      } else {
        // Single sentence chunk
        currentSentences = [sentence];
        currentLength = sentenceText.length;
      }
    }
  }

  // Handle final chunk
  if (currentSentences.length > 0) {
    const chunkText = currentSentences.map(s => s.s).join(' ').trim();
    const chunkStart = currentSentences[0].start;
    const chunkEnd = currentSentences[currentSentences.length - 1].end;
    const pn = resolvePageNumberForOffset(markers, pageNum, chunkStart);
    results.push({ text: chunkText, start: chunkStart, end: chunkEnd, page_number: pn });
  }

  // Map to chunk objects
  return results.map((r, i) => ({
    text: r.text,
    index: i,
    tokens: Math.ceil(r.text.length / 4),
    metadata: {
      ...baseMetadata,
      chunkingMethod: 'langchain-sentences',
      page_number: r.page_number,
    }
  }));
}

/**
 * Create overlap using complete sentences from the end of previous chunk
 * @param {Array} sentences - Array of sentence objects
 * @param {number} targetOverlapChars - Target overlap length in characters
 * @returns {Array} Array of sentences for overlap
 */
function createSentenceOverlap(sentences, targetOverlapChars) {
  if (!sentences.length || targetOverlapChars <= 0) return [];

  const overlap = [];
  let overlapLength = 0;

  // Work backwards from the end, adding complete sentences
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i];
    const sentenceLength = sentence.s.length;

    // Add sentence if it fits within target overlap or if we have no overlap yet
    if (overlapLength + sentenceLength <= targetOverlapChars || overlap.length === 0) {
      overlap.unshift(sentence);
      overlapLength += sentenceLength + (overlap.length > 1 ? 1 : 0); // +1 for space
    } else {
      break;
    }

    // Don't include more than 2 sentences in overlap to keep context manageable
    if (overlap.length >= 2) break;
  }

  return overlap;
}

function resolvePageNumberForOffset(markers, defaultPage, offset) {
  if (markers.length === 0) return defaultPage ?? null;
  let pn = defaultPage ?? null;
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].index <= offset) pn = markers[i].page;
    else break;
  }
  return pn;
}

// New async variant that uses LangChain when available
export async function smartChunkDocumentAsync(text, options = {}) {
  return smartChunkDocument(text, options);
}

// Export LangChainChunker for backward compatibility
export { LangChainChunker };

// Create instance for backward compatibility
export const langChainChunker = new LangChainChunker();

// Export utility functions for testing
export { sentenceSegments, createSentenceOverlap };

/**
 * Hierarchical document chunking with structure awareness
 * @param {string} text - Document text
 * @param {Object} options - Chunking options
 * @returns {Array<{text: string, index: number, tokens: number, metadata: Object}>} Enhanced chunks
 */
export function hierarchicalChunkDocument(text, options = {}) {
  const {
    maxTokens = 600,
    overlapTokens = 150
  } = options;

  console.log('[hierarchicalChunkDocument] Starting hierarchical chunking');

  // Analyze document structure
  const structure = documentStructureDetector.analyzeStructure(text);
  console.log(`[hierarchicalChunkDocument] Structure analysis: ${structure.chapters.length} chapters, ${structure.sections.length} sections`);

  // Find semantic boundaries
  const boundaries = documentStructureDetector.findSemanticBoundaries(text, structure);
  console.log(`[hierarchicalChunkDocument] Found ${boundaries.length} semantic boundaries`);

  // Create chunks respecting semantic boundaries
  const chunks = createSemanticChunks(text, boundaries, structure, { maxTokens, overlapTokens });
  console.log(`[hierarchicalChunkDocument] Created ${chunks.length} semantic chunks`);

  return chunks;
}

/**
 * Create chunks that respect semantic boundaries
 * @private
 */
function createSemanticChunks(text, boundaries, structure, options) {
  const { maxTokens, overlapTokens } = options;
  const chunks = [];

  if (boundaries.length === 0) {
    // No structure detected, create a single chunk
    console.log('[createSemanticChunks] No boundaries found, creating single chunk');
    return [{
      text: text.trim(),
      index: 0,
      tokens: estimateTokens(text),
      metadata: {
        type: 'unstructured',
        chunkingMethod: 'hierarchical-single',
        structure_detected: false
      }
    }];
  }

  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let chunkStart = 0;
  let currentContext = {
    chapter: null,
    section: null,
    subsection: null
  };

  // Process text between boundaries
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    
    // Update current context based on boundary type
    updateContext(currentContext, boundary, structure);

    // Extract text segment
    const segmentEnd = nextBoundary ? nextBoundary.position : text.length;
    const segment = text.substring(boundary.position, segmentEnd);
    const segmentTokens = estimateTokens(segment);

    // Decide whether to start a new chunk or continue current one
    if (shouldStartNewChunk(currentTokens, segmentTokens, maxTokens, boundary)) {
      // Save current chunk if it has content
      if (currentChunk.trim().length > 0) {
        chunks.push(createChunkWithMetadata(
          currentChunk.trim(),
          chunkIndex,
          currentTokens,
          currentContext,
          chunkStart,
          boundary.position,
          structure
        ));
        chunkIndex++;
      }

      // Start new chunk
      currentChunk = segment;
      currentTokens = segmentTokens;
      chunkStart = boundary.position;
    } else {
      // Add to current chunk
      currentChunk += segment;
      currentTokens += segmentTokens;
    }

    // Add overlap context if chunk is getting large
    if (currentTokens > maxTokens * 0.8 && i < boundaries.length - 1) {
      // Add current chunk and start new one with overlap
      chunks.push(createChunkWithMetadata(
        currentChunk.trim(),
        chunkIndex,
        currentTokens,
        currentContext,
        chunkStart,
        boundary.position + segment.length,
        structure
      ));
      
      // Create overlap for next chunk
      const overlapText = createOverlapText(currentChunk, overlapTokens);
      currentChunk = overlapText;
      currentTokens = estimateTokens(overlapText);
      chunkStart = Math.max(0, boundary.position - overlapText.length);
      chunkIndex++;
    }
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(createChunkWithMetadata(
      currentChunk.trim(),
      chunkIndex,
      currentTokens,
      currentContext,
      chunkStart,
      text.length,
      structure
    ));
  }

  return addChunkRelationships(chunks);
}

/**
 * Update the current context based on boundary
 * @private
 */
function updateContext(context, boundary, structure) {
  if (boundary.type === 'chapter') {
    context.chapter = boundary.title;
    context.section = null;
    context.subsection = null;
  } else if (boundary.type === 'section') {
    context.section = boundary.title;
    context.subsection = null;
  } else if (boundary.type === 'subsection') {
    context.subsection = boundary.title;
  }
}

/**
 * Decide whether to start a new chunk
 * @private
 */
function shouldStartNewChunk(currentTokens, segmentTokens, maxTokens, boundary) {
  // Always start new chunk for high-importance boundaries
  if (boundary.importance >= 4) return true;
  
  // Start new chunk if adding segment would exceed token limit
  if (currentTokens + segmentTokens > maxTokens) return true;
  
  // Don't break for low-importance boundaries unless necessary
  return false;
}

/**
 * Create overlap text from the end of current chunk
 * @private
 */
function createOverlapText(text, maxOverlapTokens) {
  const words = text.split(/\s+/);
  const tokensPerWord = 1.3; // Rough estimate
  const maxWords = Math.floor(maxOverlapTokens / tokensPerWord);
  
  if (words.length <= maxWords) return text;
  
  // Take last maxWords, but try to end at sentence boundary
  const overlapWords = words.slice(-maxWords);
  const overlapText = overlapWords.join(' ');
  
  // Try to find a sentence boundary to cut at
  const lastSentence = overlapText.lastIndexOf('.');
  if (lastSentence > overlapText.length * 0.5) {
    return overlapText.substring(lastSentence + 1).trim();
  }
  
  return overlapText;
}

/**
 * Create chunk with rich metadata
 * @private
 */
function createChunkWithMetadata(text, index, tokens, context, startPos, endPos, structure) {
  // Detect chunk characteristics
  const chunkType = detectChunkType(text);
  const containsLists = /^[\s]*[•\-\*\d+]/m.test(text);
  const containsTables = /\|.*\|/.test(text) || /\t.*\t/.test(text);

  return {
    text,
    index,
    tokens,
    metadata: {
      // Structure information
      chapter_title: context.chapter,
      section_title: context.section,
      subsection_title: context.subsection,
      
      // Chunk characteristics
      chunk_type: chunkType,
      is_list: containsLists,
      is_table: containsTables,
      is_complete_section: false, // Will be updated in addChunkRelationships
      
      // Position information
      start_position: startPos,
      end_position: endPos,
      
      // Processing metadata
      chunkingMethod: 'hierarchical',
      structure_detected: true,
      document_complexity: structure.metadata?.structureComplexity || 'unknown',
      document_type: structure.metadata?.documentType || 'unknown',
      
      // Relationships (will be filled by addChunkRelationships)
      previous_chunk: null,
      next_chunk: null,
      related_chunks: []
    }
  };
}

/**
 * Detect the type of content in a chunk
 * @private
 */
function detectChunkType(text) {
  if (/^[\s]*[•\-\*]\s+/.test(text)) return 'list_content';
  if (/\|.*\|/.test(text)) return 'table_content';
  if (/^(Kapitel|Chapter|Teil)\s+/i.test(text)) return 'chapter_heading';
  if (/^\d+\.?\d*\s+/.test(text)) return 'section_content';
  if (text.split('\n').length <= 2) return 'heading';
  return 'paragraph_content';
}

/**
 * Add relationships between chunks
 * @private
 */
function addChunkRelationships(chunks) {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Add previous/next relationships
    if (i > 0) {
      chunk.metadata.previous_chunk = chunks[i - 1].index;
    }
    if (i < chunks.length - 1) {
      chunk.metadata.next_chunk = chunks[i + 1].index;
    }
    
    // Mark complete sections (chunks that contain entire sections)
    chunk.metadata.is_complete_section = isCompleteSection(chunk, chunks);
    
    // Find related chunks (same section/chapter)
    chunk.metadata.related_chunks = findRelatedChunks(chunk, chunks);
  }
  
  return chunks;
}

/**
 * Check if chunk contains a complete section
 * @private
 */
function isCompleteSection(chunk, allChunks) {
  if (!chunk.metadata.section_title) return false;
  
  // Check if other chunks share the same section
  const sameSectionChunks = allChunks.filter(c => 
    c.metadata.section_title === chunk.metadata.section_title
  );
  
  return sameSectionChunks.length === 1;
}

/**
 * Find chunks related to the current chunk
 * @private
 */
function findRelatedChunks(chunk, allChunks) {
  const related = [];
  
  for (const otherChunk of allChunks) {
    if (otherChunk.index === chunk.index) continue;
    
    // Same section = highly related
    if (otherChunk.metadata.section_title === chunk.metadata.section_title) {
      related.push({
        chunk_index: otherChunk.index,
        relationship: 'same_section',
        strength: 0.9
      });
    }
    // Same chapter = moderately related
    else if (otherChunk.metadata.chapter_title === chunk.metadata.chapter_title) {
      related.push({
        chunk_index: otherChunk.index,
        relationship: 'same_chapter',
        strength: 0.6
      });
    }
  }
  
  return related;
}

/**
 * Unified metadata enrichment for chunks
 * Consolidates all enrichment logic from both LangChainChunker and textChunker
 */
export function enrichChunkWithMetadata(chunk, baseMetadata = {}) {
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
        blockquotes: !!md.blockquotes,
      },
      // Prefer pre-set page_number (e.g., from page-splitting) over detection
      page_number: (chunk.metadata && chunk.metadata.page_number != null) ? chunk.metadata.page_number : pageNumberDetected,
      quality_score: Number.isFinite(quality) ? quality : 0,
    }
  };
}
