/**
 * Chat Memory Service for Grünerator
 *
 * Provides Redis-based short-term memory for chat conversations.
 * Stores conversation history for AI context while frontend maintains
 * its own localStorage for UI display.
 *
 * Key features:
 * - 24-hour TTL (auto-expiry)
 * - Trimmed to last 20 messages
 * - Per-user conversation storage
 * - No synchronization with frontend needed
 */

import { redisClient } from '../../utils/redis/index.js';

import type {
  Conversation,
  ConversationStats,
  MessageRole,
  PendingRequest,
  ExperimentalSession,
  SessionSummary,
} from './types.js';

// Configuration
const CHAT_TTL = 24 * 60 * 60; // 24 hours in seconds
const MAX_MESSAGES = 20; // Keep last 20 messages for context

/**
 * Get conversation history for a user from Redis
 * @param userId - User ID
 * @returns Conversation object with messages and metadata
 */
export async function getConversation(userId: string): Promise<Conversation> {
  if (!userId) {
    return { messages: [], metadata: {} };
  }

  try {
    const key = `chat:${userId}`;
    const data = await redisClient.get(key);

    if (!data) {
      return { messages: [], metadata: {} };
    }

    const conversation: Conversation = JSON.parse(String(data));
    console.log(
      `[ChatMemory] Retrieved conversation for ${userId}: ${conversation.messages?.length || 0} messages`
    );

    return conversation;
  } catch (error) {
    console.error('[ChatMemory] Error retrieving conversation:', error);
    return { messages: [], metadata: {} };
  }
}

/**
 * Add a message to the conversation history
 * @param userId - User ID
 * @param role - Message role ('user', 'assistant', 'system')
 * @param content - Message content
 * @param agent - Agent that generated the message (optional)
 * @returns Updated conversation object
 */
export async function addMessage(
  userId: string,
  role: MessageRole,
  content: string,
  agent: string | null = null
): Promise<Conversation> {
  if (!userId || !role || !content) {
    console.warn('[ChatMemory] Missing required parameters:', { userId, role, content });
    return { messages: [], metadata: {} };
  }

  try {
    // Get existing conversation
    const conversation = await getConversation(userId);

    // Create new message
    const message = {
      role,
      content,
      timestamp: Date.now(),
      ...(agent && { agent }),
    };

    // Add to conversation
    conversation.messages.push(message);

    // Trim to keep only last MAX_MESSAGES
    if (conversation.messages.length > MAX_MESSAGES) {
      conversation.messages = conversation.messages.slice(-MAX_MESSAGES);
      console.log(`[ChatMemory] Trimmed conversation for ${userId} to ${MAX_MESSAGES} messages`);
    }

    // Update metadata
    if (agent) {
      conversation.metadata.lastAgent = agent;
    }
    conversation.metadata.lastUpdated = Date.now();
    conversation.metadata.messageCount = conversation.messages.length;

    // Save back to Redis with TTL
    const key = `chat:${userId}`;
    await redisClient.setEx(key, CHAT_TTL, JSON.stringify(conversation));

    console.log(`[ChatMemory] Added ${role} message for ${userId} (agent: ${agent || 'none'})`);
    return conversation;
  } catch (error) {
    console.error('[ChatMemory] Error adding message:', error);
    return { messages: [], metadata: {} };
  }
}

/**
 * Clear conversation history for a user
 * @param userId - User ID
 * @returns Success status
 */
export async function clearConversation(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const key = `chat:${userId}`;
    const result = await redisClient.del(key);
    const numDeleted = typeof result === 'number' ? result : parseInt(result, 10);

    console.log(
      `[ChatMemory] Cleared conversation for ${userId}: ${numDeleted > 0 ? 'success' : 'no data found'}`
    );
    return numDeleted > 0;
  } catch (error) {
    console.error('[ChatMemory] Error clearing conversation:', error);
    return false;
  }
}

/**
 * Get conversation statistics for debugging
 * @param userId - User ID
 * @returns Conversation stats
 */
export async function getConversationStats(userId: string): Promise<ConversationStats | null> {
  try {
    const conversation = await getConversation(userId);
    const key = `chat:${userId}`;
    const ttl = await redisClient.ttl(key);
    const ttlNum = typeof ttl === 'number' ? ttl : parseInt(ttl, 10);

    return {
      userId,
      messageCount: conversation.messages?.length || 0,
      lastAgent: conversation.metadata?.lastAgent || null,
      lastUpdated: conversation.metadata?.lastUpdated || null,
      expiresIn: ttlNum > 0 ? ttlNum : null,
    };
  } catch (error) {
    console.error('[ChatMemory] Error getting stats:', error);
    return null;
  }
}

/**
 * Set a pending information request for the user
 * @param userId - User ID
 * @param pendingRequest - Pending request details
 * @returns Updated conversation object
 */
export async function setPendingRequest(
  userId: string,
  pendingRequest: Omit<PendingRequest, 'timestamp'>
): Promise<Conversation> {
  if (!userId || !pendingRequest) {
    console.warn('[ChatMemory] Missing required parameters for setPendingRequest:', {
      userId,
      pendingRequest,
    });
    return { messages: [], metadata: {} };
  }

  try {
    const conversation = await getConversation(userId);

    // Add pending request to metadata
    conversation.metadata.pendingRequest = {
      ...pendingRequest,
      timestamp: Date.now(),
    } as PendingRequest;
    conversation.metadata.lastUpdated = Date.now();

    // Save back to Redis with TTL
    const key = `chat:${userId}`;
    await redisClient.setEx(key, CHAT_TTL, JSON.stringify(conversation));

    console.log(`[ChatMemory] Set pending request for ${userId}:`, pendingRequest.type);
    return conversation;
  } catch (error) {
    console.error('[ChatMemory] Error setting pending request:', error);
    return { messages: [], metadata: {} };
  }
}

/**
 * Get the current pending request for a user
 * @param userId - User ID
 * @returns Pending request or null if none exists
 */
export async function getPendingRequest(userId: string): Promise<PendingRequest | null> {
  if (!userId) {
    return null;
  }

  try {
    const conversation = await getConversation(userId);
    const pendingRequest = conversation.metadata?.pendingRequest;

    if (pendingRequest) {
      console.log(`[ChatMemory] Retrieved pending request for ${userId}:`, pendingRequest.type);
    }

    return pendingRequest || null;
  } catch (error) {
    console.error('[ChatMemory] Error getting pending request:', error);
    return null;
  }
}

/**
 * Clear the pending request for a user
 * @param userId - User ID
 * @returns Updated conversation object
 */
export async function clearPendingRequest(userId: string): Promise<Conversation> {
  if (!userId) {
    return { messages: [], metadata: {} };
  }

  try {
    const conversation = await getConversation(userId);

    if (conversation.metadata?.pendingRequest) {
      delete conversation.metadata.pendingRequest;
      conversation.metadata.lastUpdated = Date.now();

      // Save back to Redis with TTL
      const key = `chat:${userId}`;
      await redisClient.setEx(key, CHAT_TTL, JSON.stringify(conversation));

      console.log(`[ChatMemory] Cleared pending request for ${userId}`);
    }

    return conversation;
  } catch (error) {
    console.error('[ChatMemory] Error clearing pending request:', error);
    return { messages: [], metadata: {} };
  }
}

// Lock configuration for race condition prevention
const PENDING_LOCK_TTL = 5; // 5 seconds lock TTL

/**
 * Acquire a lock for pending request operations
 * Prevents race conditions when multiple requests check/modify pending state
 * @param userId - User ID
 * @returns True if lock was acquired, false otherwise
 */
export async function acquirePendingLock(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    const lockKey = `pending_lock:${userId}`;
    // SET with NX (only if not exists) and EX (expiry in seconds)
    const result = await redisClient.set(lockKey, Date.now().toString(), {
      NX: true,
      EX: PENDING_LOCK_TTL,
    });
    const acquired = result === 'OK';
    if (acquired) {
      console.log(`[ChatMemory] Acquired pending lock for ${userId}`);
    } else {
      console.log(`[ChatMemory] Could not acquire pending lock for ${userId} (already locked)`);
    }
    return acquired;
  } catch (error) {
    console.error('[ChatMemory] Error acquiring pending lock:', error);
    return false;
  }
}

/**
 * Release the pending request lock
 * @param userId - User ID
 * @returns True if lock was released
 */
export async function releasePendingLock(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    const lockKey = `pending_lock:${userId}`;
    await redisClient.del(lockKey);
    console.log(`[ChatMemory] Released pending lock for ${userId}`);
    return true;
  } catch (error) {
    console.error('[ChatMemory] Error releasing pending lock:', error);
    return false;
  }
}

/**
 * Check if a pending request exists and is still valid (not expired)
 * @param userId - User ID
 * @param maxAge - Maximum age in milliseconds (default: 30 minutes)
 * @returns True if valid pending request exists
 */
export async function hasPendingRequest(
  userId: string,
  maxAge: number = 30 * 60 * 1000
): Promise<boolean> {
  const pendingRequest = await getPendingRequest(userId);

  if (!pendingRequest) {
    return false;
  }

  // Check if request is not too old
  const isValid = Date.now() - pendingRequest.timestamp < maxAge;

  if (!isValid) {
    console.log(`[ChatMemory] Pending request expired for ${userId}, clearing it`);
    await clearPendingRequest(userId);
    return false;
  }

  return true;
}

/**
 * Health check for Redis connection
 * @returns Redis connection status
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('[ChatMemory] Redis health check failed:', error);
    return false;
  }
}

// Experimental Antrag session management
const EXPERIMENTAL_SESSION_TTL = 2 * 60 * 60; // 2 hours in seconds

/**
 * Create or update experimental Antrag session
 * @param userId - User ID
 * @param sessionData - Complete session state
 * @returns Session ID
 */
export async function setExperimentalSession(
  userId: string,
  sessionData: Partial<ExperimentalSession> & { sessionId?: string }
): Promise<string> {
  if (!userId || !sessionData) {
    throw new Error('Missing required parameters: userId and sessionData required');
  }

  try {
    // Generate session ID if not provided
    const sessionId =
      sessionData.sessionId || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add timestamps if not present
    const now = Date.now();
    const completeSessionData: ExperimentalSession = {
      ...sessionData,
      sessionId,
      userId,
      conversationState: sessionData.conversationState || '',
      createdAt: sessionData.createdAt || now,
      updatedAt: now,
      expiresAt: now + EXPERIMENTAL_SESSION_TTL * 1000,
    };

    // Store in Redis with TTL
    const key = `experimental_session:${userId}:${sessionId}`;
    await redisClient.setEx(key, EXPERIMENTAL_SESSION_TTL, JSON.stringify(completeSessionData));

    console.log(`[ChatMemory] Created/updated experimental session for ${userId}: ${sessionId}`);
    return sessionId;
  } catch (error) {
    console.error('[ChatMemory] Error setting experimental session:', error);
    throw error;
  }
}

/**
 * Retrieve experimental Antrag session
 * @param userId - User ID
 * @param sessionId - Session ID
 * @returns Session data or null if not found/expired
 */
export async function getExperimentalSession(
  userId: string,
  sessionId: string
): Promise<ExperimentalSession | null> {
  if (!userId || !sessionId) {
    console.warn('[ChatMemory] Missing userId or sessionId');
    return null;
  }

  try {
    const key = `experimental_session:${userId}:${sessionId}`;
    const data = await redisClient.get(key);

    if (!data) {
      console.log(`[ChatMemory] Experimental session not found: ${userId}:${sessionId}`);
      return null;
    }

    const sessionData: ExperimentalSession = JSON.parse(String(data));

    // Check if expired (extra validation)
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      console.log(`[ChatMemory] Experimental session expired: ${userId}:${sessionId}`);
      await redisClient.del(key);
      return null;
    }

    console.log(
      `[ChatMemory] Retrieved experimental session for ${userId}: ${sessionId} (state: ${sessionData.conversationState})`
    );
    return sessionData;
  } catch (error) {
    console.error('[ChatMemory] Error retrieving experimental session:', error);
    return null;
  }
}

/**
 * Update experimental session with partial data
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param updates - Partial state updates
 * @returns Success status
 */
export async function updateExperimentalSession(
  userId: string,
  sessionId: string,
  updates: Partial<ExperimentalSession>
): Promise<boolean> {
  if (!userId || !sessionId || !updates) {
    console.warn('[ChatMemory] Missing required parameters for update');
    return false;
  }

  try {
    // Get existing session
    const existingSession = await getExperimentalSession(userId, sessionId);
    if (!existingSession) {
      console.warn(`[ChatMemory] Cannot update non-existent session: ${userId}:${sessionId}`);
      return false;
    }

    // Merge updates
    const updatedSession: ExperimentalSession = {
      ...existingSession,
      ...updates,
      updatedAt: Date.now(),
    };

    // Save back to Redis
    const key = `experimental_session:${userId}:${sessionId}`;
    await redisClient.setEx(key, EXPERIMENTAL_SESSION_TTL, JSON.stringify(updatedSession));

    console.log(
      `[ChatMemory] Updated experimental session ${userId}:${sessionId} (state: ${updatedSession.conversationState})`
    );
    return true;
  } catch (error) {
    console.error('[ChatMemory] Error updating experimental session:', error);
    return false;
  }
}

/**
 * Delete experimental session
 * @param userId - User ID
 * @param sessionId - Session ID
 * @returns Success status
 */
export async function deleteExperimentalSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  if (!userId || !sessionId) {
    return false;
  }

  try {
    const key = `experimental_session:${userId}:${sessionId}`;
    const result = await redisClient.del(key);
    const numDeleted = typeof result === 'number' ? result : parseInt(result, 10);

    console.log(
      `[ChatMemory] Deleted experimental session ${userId}:${sessionId}: ${numDeleted > 0 ? 'success' : 'not found'}`
    );
    return numDeleted > 0;
  } catch (error) {
    console.error('[ChatMemory] Error deleting experimental session:', error);
    return false;
  }
}

/**
 * Get all experimental sessions for a user
 * @param userId - User ID
 * @returns Array of session summaries
 */
export async function getUserExperimentalSessions(userId: string): Promise<SessionSummary[]> {
  if (!userId) {
    return [];
  }

  try {
    const pattern = `experimental_session:${userId}:*`;
    const keys = await redisClient.keys(pattern);

    if (!keys || keys.length === 0) {
      return [];
    }

    // Get all sessions
    const sessions = await Promise.all(
      keys.map(async (key) => {
        try {
          const data = await redisClient.get(key);
          if (!data) return null;

          const session: ExperimentalSession = JSON.parse(String(data));
          // Return summary only
          const summary: SessionSummary = {
            sessionId: session.sessionId,
            conversationState: session.conversationState,
            thema: session.thema,
            requestType: session.requestType,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
          };
          return summary;
        } catch (error) {
          console.error(`[ChatMemory] Error parsing session ${key}:`, error);
          return null;
        }
      })
    );

    // Filter out nulls and sort by creation time
    const validSessions = sessions
      .filter((s): s is SessionSummary => s !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    console.log(`[ChatMemory] Found ${validSessions.length} experimental sessions for ${userId}`);
    return validSessions;
  } catch (error) {
    console.error('[ChatMemory] Error getting user sessions:', error);
    return [];
  }
}

/**
 * Cleanup expired experimental sessions (run periodically)
 * @returns Number of sessions cleaned
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const pattern = 'experimental_session:*';
    const keys = await redisClient.keys(pattern);

    if (!keys || keys.length === 0) {
      console.log('[ChatMemory] No experimental sessions to clean up');
      return 0;
    }

    let cleanedCount = 0;
    const now = Date.now();

    for (const key of keys) {
      try {
        const data = await redisClient.get(key);
        if (!data) continue;

        const session: ExperimentalSession = JSON.parse(String(data));

        // Check if expired
        if (session.expiresAt && now > session.expiresAt) {
          await redisClient.del(key);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`[ChatMemory] Error checking session ${key}:`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ChatMemory] Cleaned up ${cleanedCount} expired experimental sessions`);
    }

    return cleanedCount;
  } catch (error) {
    console.error('[ChatMemory] Error during cleanup:', error);
    return 0;
  }
}
