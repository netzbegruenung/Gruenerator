/**
 * ChatGraph Public Exports
 *
 * LangGraph-based agentic chat system with explicit control flow
 * for search and response generation.
 */

export { chatGraph, runChatGraph, initializeChatState } from './ChatGraph.js';
export { classifierNode, searchNode, imageNode, respondNode, buildSystemMessage } from './nodes/index.js';
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
