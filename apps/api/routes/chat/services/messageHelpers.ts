/**
 * Message Helpers
 *
 * Utility functions for processing AI SDK messages:
 * - Text extraction from ModelMessage content (string or parts array)
 * - Conversion to TokenCounter format
 * - Filtering empty assistant messages (Mistral rejects code 3240)
 */

import type { Message as TokenCounterMessage } from '../../../services/counters/types.js';

interface ContentPart {
  type: string;
  text?: string;
}

interface ModelMessage {
  role: string;
  content: string | ContentPart[];
  [key: string]: unknown;
}

export const CONTEXT_CONFIG = {
  /** Fallback budget when no context window is known. Sized for the smallest
   *  live lane (32k) so an unknown model can never overflow. */
  MAX_CONTEXT_TOKENS: 20000,
  RESPONSE_RESERVE: 3000,
};

/** Share of a model's context window the conversation history may occupy.
 *  The remainder covers the system prompt (retrieval context runs to several
 *  thousand tokens) plus the response, which is no longer output-capped. */
const PRUNING_WINDOW_SHARE = 0.7;
/** Floor so a tiny declared window can't prune a thread down to nothing. */
const MIN_PRUNING_BUDGET = 8000;

/**
 * Token budget for message pruning, derived from the model's own window.
 *
 * Deliberately NO global ceiling: the model window is the only real limit.
 * The former 40k ceiling halved what long threads could carry on the 128k
 * Mistral lanes; the 32k lanes are bounded by their own window via the share.
 */
export function getPruningBudget(contextWindowTokens?: number): number {
  if (!contextWindowTokens) return CONTEXT_CONFIG.MAX_CONTEXT_TOKENS;

  const modelBudget =
    Math.floor(contextWindowTokens * PRUNING_WINDOW_SHARE) - CONTEXT_CONFIG.RESPONSE_RESERVE;

  return Math.max(MIN_PRUNING_BUDGET, modelBudget);
}

/** Rough chars-per-token for German prose plus JSON scaffolding. */
const CHARS_PER_TOKEN = 3.5;

/**
 * Size estimate for a whole request, used for LANE ROUTING (not for pruning).
 *
 * Deliberately serialises the entire message — unlike {@link extractTextContent}
 * and the TokenCounter, which read only `type: 'text'` parts and therefore score
 * replayed tool results, images and reasoning traces as zero. For "is this
 * request too big for the small lane?" an over-estimate is the safe direction:
 * it routes to the bigger window, which is never wrong, only occasionally
 * generous.
 */
export function estimateRequestTokens(systemMessage: string, messages: readonly unknown[]): number {
  let chars = systemMessage.length;
  for (const m of messages) {
    try {
      chars += JSON.stringify(m)?.length ?? 0;
    } catch {
      // Unserialisable message (circular ref) — skip rather than fail routing.
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Extract text content from a ModelMessage content field.
 * Handles both string content and AI SDK v6 parts array format.
 */
export function extractTextContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(
      (part): part is ContentPart & { text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('');
}

/**
 * Convert an AI SDK ModelMessage to TokenCounter-compatible format.
 * Handles both string content and AI SDK v6 parts array format.
 */
export function toTokenCounterMessage(msg: ModelMessage): TokenCounterMessage {
  let content: string;

  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    content = msg.content
      .filter((part: ContentPart) => part && typeof part === 'object' && part.type === 'text')
      .map((part: ContentPart) => part.text || '')
      .join('');
  } else {
    content = '';
  }

  return {
    role: msg.role as 'user' | 'assistant' | 'system',
    content,
  };
}

/**
 * Filter out assistant messages with empty content.
 * The AI SDK's convertToModelMessages can produce [{type:'text', text:''}] for empty responses,
 * so we check actual text content, not just array length.
 * Mistral rejects empty assistant messages with code 3240.
 */
export function filterEmptyAssistantMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((msg) => {
    if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const textContent = msg.content
          .filter((part: ContentPart) => part?.type === 'text')
          .map((part: ContentPart) => part.text || '')
          .join('')
          .trim();
        return (
          textContent.length > 0 ||
          msg.content.some((part: ContentPart) => part?.type === 'tool-call')
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
export function sanitizeContentPartsForModel(messages: ModelMessage[]): ModelMessage[] {
  // 'tool-result' rides in role:'tool' messages, which fall into this branch.
  // Omitting it would silently blank a tool result into an empty text part and
  // orphan the matching tool-call.
  const VALID_USER_PART_TYPES = new Set(['text', 'image', 'tool-result']);
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

    const filtered = (msg.content as ContentPart[]).filter(
      (part: ContentPart) => part && typeof part === 'object' && allowedTypes.has(part.type)
    );

    if (filtered.length === msg.content.length) return msg;

    return { ...msg, content: filtered.length > 0 ? filtered : [{ type: 'text', text: '' }] };
  });
}

/**
 * Strip assistant messages with no effective content from the final messages array.
 * Defense-in-depth before sending to the model API.
 */
export function stripEmptyAssistantMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((msg: ModelMessage) => {
    if (msg.role !== 'assistant') return true;
    if (typeof msg.content === 'string') return msg.content.trim().length > 0;
    if (Array.isArray(msg.content)) {
      return msg.content.some(
        (part: ContentPart) =>
          (part?.type === 'text' && part.text?.trim()) || part?.type === 'tool-call'
      );
    }
    return false;
  });
}
