/**
 * Direct Search Service for Chat
 *
 * Barrel module that re-exports all direct search functionality.
 * Consumers continue importing from this file unchanged.
 *
 * Implementation is split across:
 * - searchFormatting.ts — utility functions (extractDomain, formatRelevance, truncateText, deduplicateByUrl)
 * - directSearchExecutors.ts — document, examples, and web search executors
 * - researchOrchestrator.ts — Perplexity-style structured research pipeline
 */

export {
  extractDomain,
  formatRelevance,
  truncateText,
  deduplicateByUrl,
} from './searchFormatting.js';

export {
  executeDirectSearch,
  executeDirectExamplesSearch,
  executeDirectWebSearch,
} from './directSearchExecutors.js';

export type {
  DirectSearchResult,
  DirectExamplesResult,
  DirectWebSearchResult,
} from './directSearchExecutors.js';

export { executeResearch } from './researchOrchestrator.js';

export type { ResearchCitation, ResearchResult } from './researchOrchestrator.js';
