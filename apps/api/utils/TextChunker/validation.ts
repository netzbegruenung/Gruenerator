/**
 * Validation and estimation utilities for text chunking
 * Provides input validation and token/character estimation
 */

/**
 * Estimate token count for text
 * Uses rough heuristic: 1 token ≈ 4 characters for multilingual text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // For German and multilingual text, use conservative estimate
  // Cohere's tokenizer typically uses ~1 token per 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Validate chunking options
 * Ensures options are within acceptable ranges
 */
export function validateChunkingOptions(options: any): void {
  if (options.maxTokens && (options.maxTokens < 50 || options.maxTokens > 10000)) {
    throw new Error('maxTokens must be between 50 and 10000');
  }

  if (options.overlapTokens && options.overlapTokens < 0) {
    throw new Error('overlapTokens must be non-negative');
  }

  if (options.overlapTokens && options.maxTokens &&
      options.overlapTokens >= options.maxTokens) {
    throw new Error('overlapTokens must be less than maxTokens');
  }
}

/**
 * Prepare text for embedding by cleaning and normalizing
 */
export function prepareTextForEmbedding(text: string): string {
  if (!text) return '';

  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?;:'"äöüÄÖÜß-]/g, '') // Keep only relevant characters
    .trim();
}

/**
 * Check if text is valid for chunking
 */
export function isValidText(text: string): boolean {
  return typeof text === 'string' && text.trim().length > 0;
}

/**
 * Estimate characters needed for token count
 * Inverse of estimateTokens
 */
export function tokensToChars(tokens: number): number {
  return tokens * 4;
}

/**
 * Estimate words in text
 */
export function estimateWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}
