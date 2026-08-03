/**
 * SearchGraph Module
 * Barrel export for clean imports
 */

// No compiled graph is exported: the mounted router runs the nodes one by one
// so it can stream SSE between them. The compiled `searchGraph` had zero callers.
export { initializeSearchState } from './SearchGraph.js';

export type {
  SearchGraphState,
  SearchGraphInput,
  SearchGraphOutput,
  SearchMode,
  ChatSearchResult,
  ChatCitation,
} from './types.js';

// Node exports (for controller to run nodes individually with SSE)
export { queryPlannerNode } from './nodes/queryPlannerNode.js';
export { searchExecutorNode } from './nodes/searchExecutorNode.js';
export { intelligentCrawlNode } from './nodes/intelligentCrawlNode.js';
export { deepResearchNode, setResearchProgressCallback } from './nodes/deepResearchNode.js';
export { searchRespondNode } from './nodes/searchRespondNode.js';
export { suggestFollowUpsNode } from './nodes/suggestFollowUpsNode.js';
