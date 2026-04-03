/**
 * ChatGraph Public Exports
 *
 * LangGraph-based agentic chat system.
 * Pipeline: classify → search → rerank → qualityGate → respond
 */

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
  GatherSource,
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
