/**
 * ChatGraph Public Exports
 *
 * LangGraph-based agentic chat system. The DeepAgent (ReAct) is the
 * default pipeline; the legacy fixed pipeline is kept for backwards
 * compatibility.
 */

// Default pipeline: ReAct deep agent
export { createDeepAgent, convertToLangChainMessages } from './deepAgent.js';
export type { DeepAgentInput, DeepAgentInstance } from './deepAgent.js';

// Legacy fixed pipeline (@deprecated — use DeepAgent instead)
export { chatGraph, runChatGraph, initializeChatState } from './ChatGraph.js';
export {
  classifierNode,
  briefGeneratorNode,
  searchNode,
  rerankNode,
  imageNode,
  imageEditNode,
  summarizeNode,
  respondNode,
  buildSystemMessage,
} from './nodes/index.js';
export {
  buildCitations,
  COLLECTION_LABELS,
  getDefaultCollectionsForLocale,
} from './nodes/searchNode.js';

export type {
  ChatGraphInput,
  ChatGraphOutput,
  ChatGraphState,
  SearchIntent,
  SearchSource,
  SearchResult,
  Citation,
  ClassificationResult,
  ImageStyle,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  ThreadAttachment,
  UserLocale,
} from './types.js';
