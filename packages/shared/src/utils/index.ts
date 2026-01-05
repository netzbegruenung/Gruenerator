// Text normalization utilities for German text search
export {
  foldUmlauts,
  normalizeUnicodeNumbers,
  normalizeQuery,
  normalizeText,
  tokenizeQuery,
  generateQueryVariants,
  containsNormalized
} from './textNormalization.js';

// String distance and similarity utilities
export {
  levenshteinDistance,
  normalizeForNameMatch,
  calculateNameSimilarity,
  findBestMatch
} from './stringDistance.js';
