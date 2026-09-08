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

// Stable citation keys for search hits (shared by both MCP servers)
export { buildSourceRef, canonicalizeSourceUrl, type SourceRefInput } from './sourceRefs.js';
export { formatResearchHitCount } from './researchHitLabel.js';

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

// HTML entity decoding (named incl. umlauts, decimal, hex) — no tag stripping
export { decodeHtmlEntities } from './decodeHtmlEntities.js';

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
  buildChatThreadSlug,
  extractSlugSuffix,
} from './slug.js';

// Nextcloud share links — one parser for API, web and the chat classifier
export {
  parseCloudShareLink,
  checkCloudShareLink,
  isCloudShareUrl,
  looksLikeCloudSharePath,
  type ParsedCloudShareLink,
  type CloudShareLinkCheck,
  type CloudShareLinkProblem,
} from './cloudShareLink.js';

// Usage-based ranking (favourites-first ordering for notebooks & agents)
export { compareUsageStats, sortByUsage } from './usageRanking.js';
export type { UsageStat, UsageMap } from './usageRanking.js';

// MCP connector brand colours (shared by settings + chat mention picker)
export { mcpBrandColor } from './mcpBrand.js';

// Time-of-day + locale-aware greeting (web Workplace + mobile Chat home)
export { getGreeting, isPrideMonth, type GreetingOptions } from './greeting.js';

// Data-URL-Parsing (base64) — payload-sicher, siehe dataUrl.ts
export {
  parseDataUrl,
  extractBase64,
  stripDataUrlPrefix,
  isDataUrl,
  decodedByteLength,
  type ParsedDataUrl,
} from './dataUrl.js';

// Natural-language notebook/research query parser (region/date/topic)
export { parseNotebookQuery } from './notebookQuery.js';
export type { NotebookQueryFilters } from './notebookQuery.js';

// Durable mention tokens (@[Label](type:id)) — shared FE/BE spec
export {
  buildMentionToken,
  parseMentionTokens,
  sanitizeMentionTokens,
  hasMentionTokens,
  mentionTokenRegex,
} from './mentionTokens.js';
export type { MentionToken, MentionTokenType } from './mentionTokens.js';
