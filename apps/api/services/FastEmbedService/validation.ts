/**
 * Input validation for embedding service
 * Validates text inputs before processing
 */

/**
 * Validate single text input
 */
export function validateText(text: unknown): asserts text is string {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required and must be a string');
  }
}

/**
 * Validate array of texts
 */
export function validateTexts(texts: unknown): asserts texts is string[] {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts must be a non-empty array');
  }
}

/**
 * Estimate token count for text
 * Simple estimation: roughly 4 chars per token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
