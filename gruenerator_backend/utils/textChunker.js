/**
 * Text chunking utility for document processing
 * Splits documents into chunks suitable for embedding generation
 */

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
    maxTokens = 400,
    overlapTokens = 50,
    preserveStructure = true
  } = options;

  // Check if document has clear page structure
  const hasPageMarkers = /(?:##\s*(?:Seite|Page)\s*\d+|---\s*Page\s*\d+\s*---)/i.test(text);
  
  if (hasPageMarkers && preserveStructure) {
    // Use page-based chunking
    const pageChunks = chunkByPages(text, maxTokens);
    return pageChunks.map(chunk => ({
      ...chunk,
      metadata: {
        type: 'page-based',
        pages: chunk.pages
      }
    }));
  } else {
    // Use sentence-based chunking with overlap
    const chunks = chunkText(text, { maxTokens, overlapTokens });
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        type: 'sentence-based',
        overlap: overlapTokens
      }
    }));
  }
}