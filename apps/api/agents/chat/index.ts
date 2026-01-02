/**
 * Chat Agents Barrel Export
 * Provides backward-compatible exports for all chat agent functionality
 */

// Main classification functions
export {
  classifyIntent,
  classifyWithAI,
  getAvailableAgents,
  AGENT_MAPPINGS,
  findKeywordMatch,
  classifyFromContext,
  isQuestionMessage
} from './IntentClassifier.js';

// Type exports
export type {
  AgentMapping,
  AgentMappings,
  Intent,
  ClassificationResult,
  ChatContext,
  AIWorkerPool,
  AIWorkerRequest,
  AIWorkerResponse,
  AIClassificationResponse,
  KeywordMatch,
  ContextClassification
} from './types.js';
