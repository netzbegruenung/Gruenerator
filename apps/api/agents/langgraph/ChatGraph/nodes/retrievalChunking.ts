/**
 * Chunking and MIME sniffing shared by the multi-doc fan-out retrievers
 * (connectRetrieval for Nango-connected sources, wolkeRetrieval for Nextcloud).
 *
 * CHUNK_SIZE and CHUNK_OVERLAP are recall-tuning knobs — the reason to have
 * them here is not the twenty duplicated lines but that two copies of a tuning
 * constant drift the moment someone tunes one of them.
 */

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 100;

export function chunkText(text: string, perSourceLimit: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= CHUNK_SIZE) return [cleaned];
  const chunks: string[] = [];
  let pos = 0;
  const stride = CHUNK_SIZE - CHUNK_OVERLAP;
  while (pos < cleaned.length && chunks.length < perSourceLimit) {
    chunks.push(cleaned.slice(pos, pos + CHUNK_SIZE));
    pos += stride;
  }
  return chunks;
}

/** `fallback` wins when the source already reported a MIME type. */
export function mimeTypeFromName(name: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  return 'application/octet-stream';
}
