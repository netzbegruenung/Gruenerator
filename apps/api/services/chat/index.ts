/**
 * Chat Services Module Exports
 *
 * Barrel export file for chat-related services.
 * Provides unified API surface for external consumers.
 */

// ChatMemoryService - Redis-based conversation memory
export {
  getConversation,
  addMessage,
  clearConversation,
  getConversationStats,
  setPendingRequest,
  getPendingRequest,
  clearPendingRequest,
  acquirePendingLock,
  releasePendingLock,
  hasPendingRequest,
  healthCheck,
  setExperimentalSession,
  getExperimentalSession,
  updateExperimentalSession,
  deleteExperimentalSession,
  getUserExperimentalSessions,
  cleanupExpiredSessions
} from './ChatMemoryService.js';

// Re-export types
export type * from './types.js';
