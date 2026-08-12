/**
 * Contextual embedding input: prepend the document title to each chunk before
 * embedding, so the vector carries document context the bare chunk lacks.
 * The stored payload (chunk_text) stays raw — this only shapes the vector.
 */

const MAX_TITLE_PREFIX_CHARS = 200;

export function buildEmbeddingText(chunkText: string, title?: string | null): string {
  const trimmed = (title ?? '').trim();
  if (!trimmed) return chunkText;
  const prefix =
    trimmed.length > MAX_TITLE_PREFIX_CHARS ? trimmed.slice(0, MAX_TITLE_PREFIX_CHARS) : trimmed;
  // Skip if the chunk already begins with the title (e.g. first chunk of a page)
  if (chunkText.slice(0, prefix.length + 40).includes(prefix)) return chunkText;
  return `${prefix}\n\n${chunkText}`;
}

export function buildEmbeddingTexts(chunkTexts: string[], title?: string | null): string[] {
  return chunkTexts.map((text) => buildEmbeddingText(text, title));
}
