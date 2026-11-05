/**
 * Direct Search Service for Chat
 *
 * Barrel module that re-exports all direct search functionality.
 * Consumers continue importing from this file unchanged.
 *
 * Implementation is split across:
 * - searchFormatting.ts — utility functions (extractDomainLabel, formatRelevance, truncateText, deduplicateByUrl)
 * - directSearchExecutors.ts — document, examples, and web search executors
 */

export {
  extractDomainLabel,
  formatRelevance,
  truncateText,
  deduplicateByUrl,
} from './searchFormatting.js';

export {
  executeDirectSearch,
  executeDirectExamplesSearch,
  executeDirectPressemitteilungExamples,
  executeDirectWahlpruefsteinExamples,
  executeDirectWebSearch,
} from './directSearchExecutors.js';

export type {
  DirectSearchResult,
  DirectExamplesResult,
  DirectPressemitteilungExamplesResult,
  PressemitteilungExample,
  DirectWahlpruefsteinExamplesResult,
  WahlpruefsteinExample,
  DirectWebSearchResult,
} from './directSearchExecutors.js';
