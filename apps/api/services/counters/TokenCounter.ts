/**
 * Token Counter Utility
 * Provides token counting and message trimming for managing LLM context windows
 * Uses simple character-based estimation (1 token ≈ 4 characters) for fast computation
 */

import type { Message, TokenStats } from './types.js';

export class TokenCounter {
  /**
   * Estimate token count for a given text
   * Simple estimation: 1 token ≈ 4 characters
   */
  countTokens(text: string): number {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // Conservative estimate that works well for most languages including German
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate token count for a message object
   */
  countMessageTokens(message: Message): number {
    if (!message || !message.content) {
      return 0;
    }

    // Count content tokens plus small overhead for role and metadata
    const contentTokens = this.countTokens(message.content);
    const metadataTokens = 10; // Overhead for role, timestamp, etc.

    return contentTokens + metadataTokens;
  }

  /**
   * Trim messages array to fit within token limit
   * Keeps system messages and most recent conversation messages
   */
  trimMessagesToTokenLimit(messages: Message[], maxTokens = 6000): Message[] {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    // Separate system messages from conversation
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Count tokens in system messages (always keep these)
    let tokenCount = systemMessages.reduce((sum, msg) => sum + this.countMessageTokens(msg), 0);

    // Reserve some tokens for the response
    const responseReserve = 1000;
    const availableTokens = maxTokens - responseReserve;

    if (tokenCount >= availableTokens) {
      console.warn('[TokenCounter] System messages exceed available tokens');
      return systemMessages;
    }

    // Add conversation messages from most recent, working backwards
    const keptConversation: Message[] = [];
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const message = conversationMessages[i];
      const messageTokens = this.countMessageTokens(message);

      if (tokenCount + messageTokens > availableTokens) {
        break; // Would exceed limit, stop here
      }

      keptConversation.unshift(message); // Add to beginning
      tokenCount += messageTokens;
    }

    const result = [...systemMessages, ...keptConversation];

    console.log(
      `[TokenCounter] Trimmed ${messages.length} messages to ${result.length} (${tokenCount}/${maxTokens} tokens)`
    );

    return result;
  }

  /**
   * Get token statistics for a conversation
   */
  getTokenStats(messages: Message[]): TokenStats {
    if (!Array.isArray(messages)) {
      return {
        totalTokens: 0,
        messageCount: 0,
        averageTokensPerMessage: 0,
        systemMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
      };
    }

    const totalTokens = messages.reduce((sum, msg) => sum + this.countMessageTokens(msg), 0);
    const messageCount = messages.length;
    const averageTokensPerMessage = messageCount > 0 ? Math.round(totalTokens / messageCount) : 0;

    return {
      totalTokens,
      messageCount,
      averageTokensPerMessage,
      systemMessages: messages.filter((m) => m.role === 'system').length,
      userMessages: messages.filter((m) => m.role === 'user').length,
      assistantMessages: messages.filter((m) => m.role === 'assistant').length,
    };
  }

  /**
   * Check if messages array exceeds token limit
   */
  exceedsTokenLimit(messages: Message[], maxTokens = 6000): boolean {
    const stats = this.getTokenStats(messages);
    return stats.totalTokens > maxTokens;
  }

  /**
   * Format token count for logging
   */
  formatTokenCount(tokens: number): string {
    if (tokens > 1000) {
      return `${(tokens / 1000).toFixed(1)}k tokens`;
    }
    return `${tokens} tokens`;
  }
}

// Export singleton instance
export const tokenCounter = new TokenCounter();

// Export named functions for backward compatibility
export const countTokens = (text: string) => tokenCounter.countTokens(text);

export const countMessageTokens = (message: Message) => tokenCounter.countMessageTokens(message);

export const trimMessagesToTokenLimit = (messages: Message[], maxTokens = 6000) =>
  tokenCounter.trimMessagesToTokenLimit(messages, maxTokens);

export const getTokenStats = (messages: Message[]) => tokenCounter.getTokenStats(messages);

export const exceedsTokenLimit = (messages: Message[], maxTokens = 6000) =>
  tokenCounter.exceedsTokenLimit(messages, maxTokens);

export const formatTokenCount = (tokens: number) => tokenCounter.formatTokenCount(tokens);
