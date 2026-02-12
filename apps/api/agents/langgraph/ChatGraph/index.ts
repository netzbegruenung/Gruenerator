/**
 * ChatGraph Public Exports
 *
 * LangGraph-based agentic chat system with explicit control flow
 * for search and response generation.
 */

// Old pipeline (kept for backwards compatibility)
export { chatGraph, runChatGraph, initializeChatState } from './ChatGraph.js';
export {
  classifierNode,
  briefGeneratorNode,
  searchNode,
  rerankNode,
  imageNode,
  respondNode,
  buildSystemMessage,
} from './nodes/index.js';
export { buildCitations, COLLECTION_LABELS } from './nodes/searchNode.js';

// New deep agent (ReAct-based)
export { createDeepAgent, convertToLangChainMessages } from './deepAgent.js';
export type { DeepAgentInput, DeepAgentInstance } from './deepAgent.js';

export type {
  ChatGraphInput,
  ChatGraphOutput,
  ChatGraphState,
  SearchIntent,
  SearchResult,
  Citation,
  ClassificationResult,
  ImageStyle,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  ThreadAttachment,
} from './types.js';
