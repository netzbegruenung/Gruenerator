/**
 * SearchGraph Module
 * Barrel export for clean imports
 */

export { searchGraph, runSearchGraph, initializeSearchState } from './SearchGraph.js';

export type {
  SearchGraphState,
  SearchGraphInput,
  SearchGraphOutput,
  SearchMode,
  ChatSearchResult,
  ChatCitation,
} from './types.js';

// Node exports (for controller to run nodes individually with SSE)
export { queryOptimizerNode } from './nodes/queryOptimizerNode.js';
export { searchExecutorNode } from './nodes/searchExecutorNode.js';
export { deepResearchNode, setResearchProgressCallback } from './nodes/deepResearchNode.js';
export { searchRespondNode } from './nodes/searchRespondNode.js';
export { suggestFollowUpsNode } from './nodes/suggestFollowUpsNode.js';
