/**
 * Text chunking utility for document processing
 * Splits documents into chunks suitable for embedding generation
 * Enhanced with hierarchical structure detection for better context preservation
 */

import { documentStructureDetector } from '../services/documentStructureDetector.js';

/**
 * Split text into chunks with overlap
 * @param {string} text - Text to split into chunks
 * @param {Object} options - Chunking options
 * @param {number} options.maxTokens - Maximum tokens per chunk (default: 400)
 * @param {number} options.overlapTokens - Number of overlapping tokens (default: 50)
 * @param {number} options.minChunkSize - Minimum chunk size in characters (default: 100)
 * @returns {Array<{text: string, index: number, tokens: number}>} Array of chunks
 */
export function chunkText(text, options = {}) {
  const {
    maxTokens = 400, // Conservative limit for 512 token model
    overlapTokens = 50,
    minChunkSize = 100
  } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  // Clean and normalize text
  const cleanedText = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();

  if (cleanedText.length < minChunkSize) {
    return [{
      text: cleanedText,
      index: 0,
      tokens: estimateTokens(cleanedText)
    }];
  }

  const chunks = [];
  const sentences = splitIntoSentences(cleanedText);
  
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let overlapBuffer = [];
  let overlapTokenCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);

    // If adding this sentence would exceed the limit, create a new chunk
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      // Save the current chunk
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        tokens: currentTokens
      });
      chunkIndex++;

      // Start new chunk with overlap from previous chunk
      currentChunk = overlapBuffer.join(' ') + ' ';
      currentTokens = overlapTokenCount;
      
      // Reset overlap buffer
      overlapBuffer = [];
      overlapTokenCount = 0;
    }

    // Add sentence to current chunk
    currentChunk += sentence + ' ';
    currentTokens += sentenceTokens;

    // Update overlap buffer
    overlapBuffer.push(sentence);
    overlapTokenCount += sentenceTokens;

    // Maintain overlap buffer size
    while (overlapTokenCount > overlapTokens && overlapBuffer.length > 1) {
      const removed = overlapBuffer.shift();
      overlapTokenCount -= estimateTokens(removed);
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      tokens: currentTokens
    });
  }

  return chunks;
}

/**
 * Split text into chunks by pages (for documents with clear page breaks)
 * @param {string} text - Text with page markers
 * @param {number} maxTokensPerChunk - Maximum tokens per chunk
 * @returns {Array<{text: string, index: number, tokens: number, pages: number[]}>} Array of chunks
 */
export function chunkByPages(text, maxTokensPerChunk = 400) {
  // Look for page markers like "## Seite X" or "Page X"
  const pagePattern = /(?:##\s*(?:Seite|Page)\s*(\d+)|---\s*Page\s*(\d+)\s*---)/gi;
  const pages = text.split(pagePattern);
  
  const chunks = [];
  let currentChunk = '';
  let currentTokens = 0;
  let currentPages = [];
  let chunkIndex = 0;

  for (let i = 0; i < pages.length; i++) {
    const pageContent = pages[i];
    
    // Skip page numbers captured by regex groups
    if (!pageContent || /^\d+$/.test(pageContent.trim())) {
      continue;
    }

    const pageTokens = estimateTokens(pageContent);
    
    // If this page would exceed the limit, save current chunk
    if (currentTokens + pageTokens > maxTokensPerChunk && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        tokens: currentTokens,
        pages: [...currentPages]
      });
      
      chunkIndex++;
      currentChunk = '';
      currentTokens = 0;
      currentPages = [];
    }

    // Add page to current chunk
    currentChunk += pageContent + '\n\n';
    currentTokens += pageTokens;
    
    // Extract page number if available
    const pageMatch = pageContent.match(/(?:Seite|Page)\s*(\d+)/i);
    if (pageMatch) {
      currentPages.push(parseInt(pageMatch[1]));
    }
  }

  // Add last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      tokens: currentTokens,
      pages: currentPages
    });
  }

  return chunks;
}

/**
 * Split text into sentences
 * @private
 */
function splitIntoSentences(text) {
  // Split on sentence boundaries, but keep the delimiter
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  // Further split very long sentences on other boundaries if needed
  const finalSentences = [];
  
  for (const sentence of sentences) {
    if (estimateTokens(sentence) > 200) {
      // Split long sentences on semicolons, colons, or commas
      const subSentences = sentence.split(/(?<=[;:,])\s+/);
      finalSentences.push(...subSentences);
    } else {
      finalSentences.push(sentence);
    }
  }
  
  return finalSentences.filter(s => s.trim().length > 0);
}

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
 * Chunk a document intelligently based on its structure
 * @param {string} text - Document text
 * @param {Object} options - Chunking options
 * @returns {Array<{text: string, index: number, tokens: number, metadata: Object}>} Chunks
 */
export function smartChunkDocument(text, options = {}) {
  const {
    maxTokens = 600, // Increased from 400 for better context
    overlapTokens = 150, // Increased from 50 for better overlap
    preserveStructure = true,
    useHierarchicalChunking = true
  } = options;

  if (useHierarchicalChunking) {
    return hierarchicalChunkDocument(text, { maxTokens, overlapTokens, preserveStructure });
  }

  // Fallback to original logic
  const hasPageMarkers = /(?:##\s*(?:Seite|Page)\s*\d+|---\s*Page\s*\d+\s*---)/i.test(text);
  
  if (hasPageMarkers && preserveStructure) {
    const pageChunks = chunkByPages(text, maxTokens);
    return pageChunks.map(chunk => ({
      ...chunk,
      metadata: {
        type: 'page-based',
        pages: chunk.pages,
        chunkingMethod: 'legacy'
      }
    }));
  } else {
    const chunks = chunkText(text, { maxTokens, overlapTokens });
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        type: 'sentence-based',
        overlap: overlapTokens,
        chunkingMethod: 'legacy'
      }
    }));
  }
}

/**
 * Hierarchical document chunking with structure awareness
 * @param {string} text - Document text
 * @param {Object} options - Chunking options
 * @returns {Array<{text: string, index: number, tokens: number, metadata: Object}>} Enhanced chunks
 */
export function hierarchicalChunkDocument(text, options = {}) {
  const {
    maxTokens = 600,
    overlapTokens = 150,
    preserveStructure = true
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
    // No structure detected, fall back to sentence-based chunking
    console.log('[createSemanticChunks] No boundaries found, falling back to sentence chunking');
    const fallbackChunks = chunkText(text, { maxTokens, overlapTokens });
    return fallbackChunks.map(chunk => ({
      ...chunk,
      metadata: {
        type: 'sentence-based',
        chunkingMethod: 'hierarchical-fallback',
        structure_detected: false
      }
    }));
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