/**
 * WebSearchGraph Module
 * Barrel export for clean imports
 */

// Main exports
export { webSearchGraph, runWebSearch } from './WebSearchGraph.js';

// Type exports
export type {
  WebSearchState,
  WebSearchInput,
  WebSearchOutput,
  NormalSearchOutput,
  DeepSearchOutput,
  SearchResult,
  WebSearchBatch,
  GrundsatzResult,
  CrawlDecision,
  EnrichedResult,
  Citation,
  CategorizedSources,
  ResearchDossier,
  SearchOptions,
  CrawlMetadata,
  SearchMetadata
} from './types.js';

// Node exports (for advanced use cases)
export { plannerNode } from './nodes/PlannerNode.js';
export { searxngNode } from './nodes/SearxngNode.js';
export { intelligentCrawlerNode } from './nodes/IntelligentCrawlerNode.js';
export { contentEnricherNode } from './nodes/ContentEnricherNode.js';
export { grundsatzNode } from './nodes/GrundsatzNode.js';
export { aggregatorNode } from './nodes/AggregatorNode.js';
export { summaryNode } from './nodes/SummaryNode.js';
export { dossierNode } from './nodes/DossierNode.js';

// Utility exports (for advanced use cases)
export { optimizeSearchQuery, generateResearchQuestions } from './utilities/queryOptimizer.js';
export { getIntelligentSearchOptions } from './utilities/searchOptions.js';
export { filterDataForAI } from './utilities/dataFilter.js';
export { buildDossierSystemPrompt, buildDossierPrompt, buildMethodologySection } from './utilities/dossierBuilder.js';
export { extractKeyParagraphs } from './utilities/contentExtractor.js';
