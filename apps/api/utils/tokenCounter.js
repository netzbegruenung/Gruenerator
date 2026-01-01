/**
 * Token Counter Utility for Grünerator
 *
 * Provides token counting and message trimming for managing LLM context windows.
 * Uses simple character-based estimation (1 token ≈ 4 characters) for fast computation.
 *
 * Used by chat memory system to ensure conversation history fits within
 * model context limits while preserving the most relevant recent messages.
 */

/**
 * Estimate token count for a given text
 * @param {string} text - Text to count tokens for
 * @returns {number} Estimated token count
 */
function countTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Simple estimation: 1 token ≈ 4 characters
  // This is a conservative estimate that works well for most languages
  // including German text which can have longer words
  return Math.ceil(text.length / 4);
}

/**
 * Estimate token count for a message object
 * @param {Object} message - Message object with content
 * @returns {number} Estimated token count
 */
function countMessageTokens(message) {
  if (!message || !message.content) {
    return 0;
  }

  // Count content tokens plus small overhead for role and metadata
  const contentTokens = countTokens(message.content);
  const metadataTokens = 10; // Overhead for role, timestamp, etc.

  return contentTokens + metadataTokens;
}

/**
 * Trim messages array to fit within token limit
 * Keeps system messages and most recent conversation messages
 * @param {Array} messages - Array of message objects
 * @param {number} maxTokens - Maximum tokens to keep (default: 6000)
 * @returns {Array} Trimmed messages array
 */
function trimMessagesToTokenLimit(messages, maxTokens = 6000) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // Separate system messages from conversation
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Count tokens in system messages (always keep these)
  let tokenCount = systemMessages.reduce((sum, msg) =>
    sum + countMessageTokens(msg), 0
  );

  // Reserve some tokens for the response
  const responseReserve = 1000;
  const availableTokens = maxTokens - responseReserve;

  if (tokenCount >= availableTokens) {
    console.warn('[TokenCounter] System messages exceed available tokens');
    return systemMessages;
  }

  // Add conversation messages from most recent, working backwards
  const keptConversation = [];
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    const message = conversationMessages[i];
    const messageTokens = countMessageTokens(message);

    if (tokenCount + messageTokens > availableTokens) {
      break; // Would exceed limit, stop here
    }

    keptConversation.unshift(message); // Add to beginning
    tokenCount += messageTokens;
  }

  const result = [...systemMessages, ...keptConversation];

  console.log(`[TokenCounter] Trimmed ${messages.length} messages to ${result.length} (${tokenCount}/${maxTokens} tokens)`);

  return result;
}

/**
 * Get token statistics for a conversation
 * @param {Array} messages - Array of message objects
 * @returns {Object} Token statistics
 */
function getTokenStats(messages) {
  if (!Array.isArray(messages)) {
    return { totalTokens: 0, messageCount: 0, averageTokensPerMessage: 0 };
  }

  const totalTokens = messages.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
  const messageCount = messages.length;
  const averageTokensPerMessage = messageCount > 0 ? Math.round(totalTokens / messageCount) : 0;

  return {
    totalTokens,
    messageCount,
    averageTokensPerMessage,
    systemMessages: messages.filter(m => m.role === 'system').length,
    userMessages: messages.filter(m => m.role === 'user').length,
    assistantMessages: messages.filter(m => m.role === 'assistant').length
  };
}

/**
 * Check if messages array exceeds token limit
 * @param {Array} messages - Array of message objects
 * @param {number} maxTokens - Token limit to check against
 * @returns {boolean} True if exceeds limit
 */
function exceedsTokenLimit(messages, maxTokens = 6000) {
  const stats = getTokenStats(messages);
  return stats.totalTokens > maxTokens;
}

/**
 * Format token count for logging
 * @param {number} tokens - Token count
 * @returns {string} Formatted token count
 */
function formatTokenCount(tokens) {
  if (tokens > 1000) {
    return `${(tokens / 1000).toFixed(1)}k tokens`;
  }
  return `${tokens} tokens`;
}

export { countTokens, countMessageTokens, trimMessagesToTokenLimit, getTokenStats, exceedsTokenLimit, formatTokenCount };