// Text normalization utilities for German text search
export {
  foldUmlauts,
  normalizeUnicodeNumbers,
  normalizeQuery,
  normalizeText,
  tokenizeQuery,
  generateQueryVariants,
  containsNormalized,
} from './textNormalization.js';

// String distance and similarity utilities
export {
  levenshteinDistance,
  normalizeForNameMatch,
  calculateNameSimilarity,
  findBestMatch,
} from './stringDistance.js';

// Tailwind CSS class merging utility
export { cn } from './cn.js';

// HTML tag stripping with entity decoding
export { stripHtmlTags } from './stripHtmlTags.js';

// HTML entity escaping for safe markup embedding
export { escapeHtml } from './escapeHtml.js';

// German relative time formatting
export { formatRelativeTime } from './formatRelativeTime.js';
export type { FormatRelativeTimeOptions } from './formatRelativeTime.js';

// Resource URL slug helpers (Notion-style: name-prefix + stable 6-char suffix)
export {
  slugifyName,
  generateSlugSuffix,
  buildNotebookSlug,
  buildGroupSlug,
  extractSlugSuffix,
} from './slug.js';
