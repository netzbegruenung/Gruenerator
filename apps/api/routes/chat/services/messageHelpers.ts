/**
 * Message Helpers
 *
 * Utility functions for processing AI SDK messages:
 * - Text extraction from ModelMessage content (string or parts array)
 * - Conversion to TokenCounter format
 * - Filtering empty assistant messages (Mistral rejects code 3240)
 */

import type { Message as TokenCounterMessage } from '../../../services/counters/types.js';

export const CONTEXT_CONFIG = {
  MAX_CONTEXT_TOKENS: 6000,
  RESPONSE_RESERVE: 1500,
};

/**
 * Extract text content from a ModelMessage content field.
 * Handles both string content and AI SDK v6 parts array format.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: string; text: string } =>
          part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join('');
  }

  return '';
}

/**
 * Convert an AI SDK ModelMessage to TokenCounter-compatible format.
 * Handles both string content and AI SDK v6 parts array format.
 */
export function toTokenCounterMessage(msg: any): TokenCounterMessage {
  let content: string;

  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    content = msg.content
      .filter((part: any) => part && typeof part === 'object' && part.type === 'text')
      .map((part: any) => part.text || '')
      .join('');
  } else {
    content = '';
  }

  return {
    role: msg.role,
    content,
  };
}

/**
 * Filter out assistant messages with empty content.
 * The AI SDK's convertToModelMessages can produce [{type:'text', text:''}] for empty responses,
 * so we check actual text content, not just array length.
 * Mistral rejects empty assistant messages with code 3240.
 */
export function filterEmptyAssistantMessages(messages: any[]): any[] {
  return messages.filter((msg) => {
    if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const textContent = msg.content
          .filter((part: any) => part?.type === 'text')
          .map((part: any) => part.text || '')
          .join('')
          .trim();
        return (
          textContent.length > 0 || msg.content.some((part: any) => part?.type === 'tool-call')
        );
      }
      return msg.content && String(msg.content).trim().length > 0;
    }
    return true;
  });
}

/**
 * Remove content part types that the AI SDK doesn't support.
 * The SDK's standardizePrompt() validates parts with Zod and rejects unknown types
 * like {type:'file'} from PDF uploads. Uses an allowlist so new unsupported types
 * are filtered automatically.
 *
 * File content is not lost — it's already extracted by processAttachments() into
 * attachmentContext, which respondNode injects into the system prompt.
 */
export function sanitizeContentPartsForModel(messages: any[]): any[] {
  const VALID_USER_PART_TYPES = new Set(['text', 'image']);
  const VALID_ASSISTANT_PART_TYPES = new Set([
    'text',
    'reasoning',
    'tool-call',
    'redacted-reasoning',
  ]);

  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;

    const allowedTypes =
      msg.role === 'assistant' ? VALID_ASSISTANT_PART_TYPES : VALID_USER_PART_TYPES;

    const filtered = msg.content.filter(
      (part: any) => part && typeof part === 'object' && allowedTypes.has(part.type)
    );

    if (filtered.length === msg.content.length) return msg;

    return { ...msg, content: filtered.length > 0 ? filtered : [{ type: 'text', text: '' }] };
  });
}

/**
 * Strip assistant messages with no effective content from the final messages array.
 * Defense-in-depth before sending to the model API.
 */
export function stripEmptyAssistantMessages(messages: any[]): any[] {
  return messages.filter((msg: any) => {
    if (msg.role !== 'assistant') return true;
    if (typeof msg.content === 'string') return msg.content.trim().length > 0;
    if (Array.isArray(msg.content)) {
      return msg.content.some(
        (part: any) => (part?.type === 'text' && part.text?.trim()) || part?.type === 'tool-call'
      );
    }
    return false;
  });
}
