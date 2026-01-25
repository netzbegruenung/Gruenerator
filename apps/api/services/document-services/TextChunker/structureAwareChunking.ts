/**
 * Structure-aware chunking for hierarchical documents
 * Uses DocumentStructureDetector to respect semantic boundaries
 */

import { documentStructureDetector } from '../../DocumentStructureDetector/index.js';
import type {
  DocumentStructure,
  SemanticBoundary as DetectorSemanticBoundary,
} from '../../DocumentStructureDetector/types.js';
import { estimateTokens } from './validation.js';
import type { Chunk, ChunkContext, SemanticBoundary } from './types.js';

/**
 * Chunk document hierarchically based on structure
 */
export function hierarchicalChunkDocument(
  text: string,
  options: { maxTokens?: number; overlapTokens?: number } = {}
): Chunk[] {
  const { maxTokens = 600, overlapTokens = 150 } = options;

  console.log('[hierarchicalChunkDocument] Starting hierarchical chunking');

  // Analyze document structure
  const structure = documentStructureDetector.analyzeStructure(text);
  console.log(
    `[hierarchicalChunkDocument] Structure analysis: ${structure.chapters.length} chapters, ${structure.sections.length} sections`
  );

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
 */
function createSemanticChunks(
  text: string,
  boundaries: DetectorSemanticBoundary[],
  structure: DocumentStructure,
  options: { maxTokens: number; overlapTokens: number }
): Chunk[] {
  const { maxTokens, overlapTokens } = options;
  const chunks: Chunk[] = [];

  if (boundaries.length === 0) {
    // No structure detected, create a single chunk
    console.log('[createSemanticChunks] No boundaries found, creating single chunk');
    return [
      {
        text: text.trim(),
        index: 0,
        tokens: estimateTokens(text),
        metadata: {
          chunkType: 'unstructured',
          chunkingMethod: 'hierarchical-single',
        },
      },
    ];
  }

  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let chunkStart = 0;
  let currentContext: ChunkContext = {
    level: 0,
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
        chunks.push(
          createChunkWithMetadata(
            currentChunk.trim(),
            chunkIndex,
            currentTokens,
            currentContext,
            chunkStart,
            boundary.position,
            structure
          )
        );
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
      chunks.push(
        createChunkWithMetadata(
          currentChunk.trim(),
          chunkIndex,
          currentTokens,
          currentContext,
          chunkStart,
          boundary.position + segment.length,
          structure
        )
      );

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
    chunks.push(
      createChunkWithMetadata(
        currentChunk.trim(),
        chunkIndex,
        currentTokens,
        currentContext,
        chunkStart,
        text.length,
        structure
      )
    );
  }

  return addChunkRelationships(chunks);
}

/**
 * Update the current context based on boundary
 */
function updateContext(
  context: ChunkContext,
  boundary: DetectorSemanticBoundary,
  structure: DocumentStructure
): void {
  if (boundary.type === 'chapter') {
    context.chapter = boundary.title;
    context.section = undefined;
    context.subsection = undefined;
    context.level = 1;
  } else if (boundary.type === 'section') {
    context.section = boundary.title;
    context.subsection = undefined;
    context.level = 2;
  } else if (boundary.type === 'subsection') {
    context.subsection = boundary.title;
    context.level = 3;
  }
}

/**
 * Decide whether to start a new chunk
 */
function shouldStartNewChunk(
  currentTokens: number,
  segmentTokens: number,
  maxTokens: number,
  boundary: DetectorSemanticBoundary
): boolean {
  // Always start new chunk for high-importance boundaries
  if (boundary.importance && boundary.importance >= 4) return true;

  // Start new chunk if adding segment would exceed token limit
  if (currentTokens + segmentTokens > maxTokens) return true;

  // Don't break for low-importance boundaries unless necessary
  return false;
}

/**
 * Create overlap text from the end of current chunk
 */
function createOverlapText(text: string, maxOverlapTokens: number): string {
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
 */
function createChunkWithMetadata(
  text: string,
  index: number,
  tokens: number,
  context: ChunkContext,
  startPos: number,
  endPos: number,
  structure: DocumentStructure
): Chunk {
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
      chapterTitle: context.chapter,
      sectionTitle: context.section,

      // Chunk characteristics
      chunkType: chunkType,

      // Position information
      startPosition: startPos,
      endPosition: endPos,
      semanticLevel: context.level,

      // Processing metadata
      chunkingMethod: 'hierarchical',

      // Relationships (will be filled by addChunkRelationships)
      prevChunkId: undefined,
      nextChunkId: undefined,
      relatedChunks: [],
    },
  };
}

/**
 * Detect the type of content in a chunk
 */
function detectChunkType(text: string): string {
  if (/^[\s]*[•\-\*]\s+/.test(text)) return 'list_content';
  if (/\|.*\|/.test(text)) return 'table_content';
  if (/^(Kapitel|Chapter|Teil)\s+/i.test(text)) return 'chapter_heading';
  if (/^\d+\.?\d*\s+/.test(text)) return 'section_content';
  if (text.split('\n').length <= 2) return 'heading';
  return 'paragraph_content';
}

/**
 * Add relationships between chunks
 */
function addChunkRelationships(chunks: Chunk[]): Chunk[] {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Add previous/next relationships
    if (i > 0) {
      chunk.metadata.prevChunkId = chunks[i - 1].index.toString();
    }
    if (i < chunks.length - 1) {
      chunk.metadata.nextChunkId = chunks[i + 1].index.toString();
    }

    // Find related chunks (same section/chapter)
    chunk.metadata.relatedChunks = findRelatedChunks(chunk, chunks);
  }

  return chunks;
}

/**
 * Check if chunk contains a complete section
 */
function isCompleteSection(chunk: Chunk, allChunks: Chunk[]): boolean {
  if (!chunk.metadata.sectionTitle) return false;

  // Check if other chunks share the same section
  const sameSectionChunks = allChunks.filter(
    (c) => c.metadata.sectionTitle === chunk.metadata.sectionTitle
  );

  return sameSectionChunks.length === 1;
}

/**
 * Find chunks related to the current chunk
 */
function findRelatedChunks(chunk: Chunk, allChunks: Chunk[]): string[] {
  const related: string[] = [];

  for (const otherChunk of allChunks) {
    if (otherChunk.index === chunk.index) continue;

    // Same section = highly related
    if (otherChunk.metadata.sectionTitle === chunk.metadata.sectionTitle) {
      related.push(otherChunk.index.toString());
    }
    // Same chapter but different section = moderately related
    else if (otherChunk.metadata.chapterTitle === chunk.metadata.chapterTitle) {
      related.push(otherChunk.index.toString());
    }
  }

  return related;
}
