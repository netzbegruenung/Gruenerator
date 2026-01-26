/**
 * MistralWebSearchService Module Exports
 *
 * Barrel export file for MistralWebSearchService module.
 */

// Main class
export { MistralWebSearchService } from './MistralWebSearchService.js';
export { default } from './MistralWebSearchService.js';

// Re-export types
export type { SearchSource, SearchResults, AgentConfig, AgentType } from './types.js';

// Re-export utilities
export { getAgentConfig } from './agentConfig.js';
export {
  extractSearchResults,
  extractDomainFromUrl,
  extractSnippetFromContent,
} from './resultExtraction.js';
