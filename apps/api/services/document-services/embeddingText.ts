/**
 * Contextual embedding input: prepend the document title — and the heading path
 * of the chunk's section — to each chunk before embedding, so the vector carries
 * document context the bare chunk lacks.
 * The stored payload (chunk_text) stays raw — this only shapes the vector.
 */

import { type ChunkMetadata } from './TextChunker/types.js';

const MAX_TITLE_PREFIX_CHARS = 200;
const MAX_HEADING_PREFIX_CHARS = 200;

/** Trennzeichen zwischen Titel und den Ebenen des Überschriftenpfads. */
const SEP = ' › ';

export function buildEmbeddingText(
  chunkText: string,
  title?: string | null,
  headingPath?: string[] | null
): string {
  const parts: string[] = [];

  const trimmedTitle = (title ?? '').trim();
  if (trimmedTitle) parts.push(trimmedTitle.slice(0, MAX_TITLE_PREFIX_CHARS));

  const path = (headingPath ?? [])
    .map((h) => (typeof h === 'string' ? h.trim() : ''))
    .filter(Boolean)
    .join(SEP);
  if (path) parts.push(path.slice(0, MAX_HEADING_PREFIX_CHARS));

  // Je Teil überspringen, was der Chunk schon trägt (z. B. der erste Chunk
  // eines Abschnitts, der mit seiner Überschrift beginnt). Zusammengesetzt
  // geprüft träfe die Regel praktisch nie mehr.
  const kept = parts.filter((part) => !chunkText.slice(0, part.length + 40).includes(part));
  if (kept.length === 0) return chunkText;

  return `${kept.join(SEP)}\n\n${chunkText}`;
}

export function buildEmbeddingTexts(chunkTexts: string[], title?: string | null): string[] {
  return chunkTexts.map((text) => buildEmbeddingText(text, title));
}

/**
 * Wie `buildEmbeddingTexts`, zieht den Überschriftenpfad aber je Chunk aus
 * dessen Metadaten. Das ist die Form, die Ingest-Pfade benutzen sollten — sie
 * haben die Chunks ohnehin in der Hand.
 */
export function buildEmbeddingTextsForChunks(
  chunks: Array<{ text: string; metadata?: ChunkMetadata | undefined }>,
  title?: string | null
): string[] {
  return chunks.map((chunk) =>
    buildEmbeddingText(chunk.text, title, chunk.metadata?.headingPath ?? null)
  );
}
