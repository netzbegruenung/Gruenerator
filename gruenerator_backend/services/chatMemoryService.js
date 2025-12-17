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

const redisClient = require('../utils/redisClient');

// Configuration
const CHAT_TTL = 24 * 60 * 60; // 24 hours in seconds
const MAX_MESSAGES = 20; // Keep last 20 messages for context

/**
 * Get conversation history for a user from Redis
 * @param {string} userId - User ID
 * @returns {Object} Conversation object with messages and metadata
 */
async function getConversation(userId) {
  if (!userId) {
    return { messages: [], metadata: {} };
  }

  try {
    const key = `chat:${userId}`;
    const data = await redisClient.get(key);

    if (!data) {
      return { messages: [], metadata: {} };
    }

    const conversation = JSON.parse(data);
    console.log(`[ChatMemory] Retrieved conversation for ${userId}: ${conversation.messages?.length || 0} messages`);

    return conversation;
  } catch (error) {
    console.error('[ChatMemory] Error retrieving conversation:', error);
    return { messages: [], metadata: {} };
  }
}

/**
 * Add a message to the conversation history
 * @param {string} userId - User ID
 * @param {string} role - Message role ('user', 'assistant', 'system')
 * @param {string} content - Message content
 * @param {string} agent - Agent that generated the message (optional)
 * @returns {Object} Updated conversation object
 */
async function addMessage(userId, role, content, agent = null) {
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
      ...(agent && { agent })
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
 * @param {string} userId - User ID
 * @returns {boolean} Success status
 */
async function clearConversation(userId) {
  if (!userId) {
    return false;
  }

  try {
    const key = `chat:${userId}`;
    const result = await redisClient.del(key);

    console.log(`[ChatMemory] Cleared conversation for ${userId}: ${result > 0 ? 'success' : 'no data found'}`);
    return result > 0;

  } catch (error) {
    console.error('[ChatMemory] Error clearing conversation:', error);
    return false;
  }
}

/**
 * Get conversation statistics for debugging
 * @param {string} userId - User ID
 * @returns {Object} Conversation stats
 */
async function getConversationStats(userId) {
  try {
    const conversation = await getConversation(userId);
    const key = `chat:${userId}`;
    const ttl = await redisClient.ttl(key);

    return {
      userId,
      messageCount: conversation.messages?.length || 0,
      lastAgent: conversation.metadata?.lastAgent || null,
      lastUpdated: conversation.metadata?.lastUpdated || null,
      expiresIn: ttl > 0 ? ttl : null
    };
  } catch (error) {
    console.error('[ChatMemory] Error getting stats:', error);
    return null;
  }
}

/**
 * Set a pending information request for the user
 * @param {string} userId - User ID
 * @param {object} pendingRequest - Pending request details
 * @returns {Object} Updated conversation object
 */
async function setPendingRequest(userId, pendingRequest) {
  if (!userId || !pendingRequest) {
    console.warn('[ChatMemory] Missing required parameters for setPendingRequest:', { userId, pendingRequest });
    return { messages: [], metadata: {} };
  }

  try {
    const conversation = await getConversation(userId);

    // Add pending request to metadata
    conversation.metadata.pendingRequest = {
      ...pendingRequest,
      timestamp: Date.now()
    };
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
 * @param {string} userId - User ID
 * @returns {Object|null} Pending request or null if none exists
 */
async function getPendingRequest(userId) {
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
 * @param {string} userId - User ID
 * @returns {Object} Updated conversation object
 */
async function clearPendingRequest(userId) {
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

/**
 * Check if a pending request exists and is still valid (not expired)
 * @param {string} userId - User ID
 * @param {number} maxAge - Maximum age in milliseconds (default: 30 minutes)
 * @returns {boolean} True if valid pending request exists
 */
async function hasPendingRequest(userId, maxAge = 30 * 60 * 1000) {
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
 * @returns {boolean} Redis connection status
 */
async function healthCheck() {
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
 * @param {string} userId - User ID
 * @param {object} sessionData - Complete session state
 * @returns {Promise<string>} Session ID
 */
async function setExperimentalSession(userId, sessionData) {
  if (!userId || !sessionData) {
    throw new Error('Missing required parameters: userId and sessionData required');
  }

  try {
    // Generate session ID if not provided
    const sessionId = sessionData.sessionId || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add timestamps if not present
    const now = Date.now();
    const completeSessionData = {
      ...sessionData,
      sessionId,
      userId,
      createdAt: sessionData.createdAt || now,
      updatedAt: now,
      expiresAt: now + (EXPERIMENTAL_SESSION_TTL * 1000)
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
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} Session data or null if not found/expired
 */
async function getExperimentalSession(userId, sessionId) {
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

    const sessionData = JSON.parse(data);

    // Check if expired (extra validation)
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      console.log(`[ChatMemory] Experimental session expired: ${userId}:${sessionId}`);
      await redisClient.del(key);
      return null;
    }

    console.log(`[ChatMemory] Retrieved experimental session for ${userId}: ${sessionId} (state: ${sessionData.conversationState})`);
    return sessionData;

  } catch (error) {
    console.error('[ChatMemory] Error retrieving experimental session:', error);
    return null;
  }
}

/**
 * Update experimental session with partial data
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {object} updates - Partial state updates
 * @returns {Promise<boolean>} Success status
 */
async function updateExperimentalSession(userId, sessionId, updates) {
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
    const updatedSession = {
      ...existingSession,
      ...updates,
      updatedAt: Date.now()
    };

    // Save back to Redis
    const key = `experimental_session:${userId}:${sessionId}`;
    await redisClient.setEx(key, EXPERIMENTAL_SESSION_TTL, JSON.stringify(updatedSession));

    console.log(`[ChatMemory] Updated experimental session ${userId}:${sessionId} (state: ${updatedSession.conversationState})`);
    return true;

  } catch (error) {
    console.error('[ChatMemory] Error updating experimental session:', error);
    return false;
  }
}

/**
 * Delete experimental session
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteExperimentalSession(userId, sessionId) {
  if (!userId || !sessionId) {
    return false;
  }

  try {
    const key = `experimental_session:${userId}:${sessionId}`;
    const result = await redisClient.del(key);

    console.log(`[ChatMemory] Deleted experimental session ${userId}:${sessionId}: ${result > 0 ? 'success' : 'not found'}`);
    return result > 0;

  } catch (error) {
    console.error('[ChatMemory] Error deleting experimental session:', error);
    return false;
  }
}

/**
 * Get all experimental sessions for a user
 * @param {string} userId - User ID
 * @returns {Promise<array>} Array of session summaries
 */
async function getUserExperimentalSessions(userId) {
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

          const session = JSON.parse(data);
          // Return summary only
          return {
            sessionId: session.sessionId,
            conversationState: session.conversationState,
            thema: session.thema,
            requestType: session.requestType,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt
          };
        } catch (error) {
          console.error(`[ChatMemory] Error parsing session ${key}:`, error);
          return null;
        }
      })
    );

    // Filter out nulls and sort by creation time
    const validSessions = sessions
      .filter(s => s !== null)
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
 * @returns {Promise<number>} Number of sessions cleaned
 */
async function cleanupExpiredSessions() {
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

        const session = JSON.parse(data);

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

module.exports = {
  getConversation,
  addMessage,
  clearConversation,
  getConversationStats,
  healthCheck,
  setPendingRequest,
  getPendingRequest,
  clearPendingRequest,
  hasPendingRequest,
  // Experimental Antrag session management
  setExperimentalSession,
  getExperimentalSession,
  updateExperimentalSession,
  deleteExperimentalSession,
  getUserExperimentalSessions,
  cleanupExpiredSessions
};