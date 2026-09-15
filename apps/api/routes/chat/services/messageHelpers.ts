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
export const CHARS_PER_TOKEN = 3.5;

/**
 * Share of the model's window that retrieved material (search results,
 * attachments, tool output) may occupy, expressed in CHARACTERS.
 *
 * Retrieval budgets used to be absolute character constants — identical on a
 * 32k and a 262k lane, because they were sized for the smallest lane and never
 * revisited. The effect on the big lane was stark: fresh research got 0.9% of
 * the window while the conversation history got ~68%, i.e. the material the
 * turn actually needed was the most tightly rationed thing in the request.
 *
 * Derived like {@link getPruningBudget}: a share, a floor, and deliberately NO
 * ceiling — the window is the only real limit.
 */
const RETRIEVAL_WINDOW_SHARE = 0.15;

/**
 * Character budget for retrieved context on a given model.
 *
 * @param contextWindowTokens the resolved window; falls back to the floor when unknown
 * @param floorChars          smallest sensible budget for the caller's material
 */
export function getRetrievalBudget(
  contextWindowTokens: number | undefined,
  floorChars: number
): number {
  if (!contextWindowTokens) return floorChars;
  const budgetChars = Math.floor(contextWindowTokens * RETRIEVAL_WINDOW_SHARE * CHARS_PER_TOKEN);
  return Math.max(floorChars, budgetChars);
}

/**
 * Split a fixed budget evenly across N items, with a floor so no item is
 * starved to zero when N grows. Deliberately no ceiling on the total: with
 * many items the sum can exceed `total` — the same soft-floor tradeoff
 * {@link getRetrievalBudget} makes, accepted so that every item (chunk slot,
 * attachment, source) keeps a guaranteed minimum share instead of the first
 * ones consuming the whole budget and starving the rest.
 */
export function fairShare(total: number, floorPerItem: number, itemCount: number): number {
  if (itemCount <= 0) return floorPerItem;
  return Math.max(floorPerItem, Math.floor(total / itemCount));
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
 *
 * Every part counts, not just `type: 'text'`. The text-only version made the
 * counter blind to exactly the parts that dominate a research thread: replayed
 * tool results, images and reasoning traces all scored 0 tokens. Pruning and
 * compaction therefore under-measured a tool-heavy thread — the mirror image of
 * the truncation bugs elsewhere, and the reason a long thread could be handed to
 * a provider well over its window.
 *
 * Non-text parts are measured by their serialised length: it is an
 * approximation, but a wrong-by-30% number beats a confidently-zero one.
 */
export function toTokenCounterMessage(msg: ModelMessage): TokenCounterMessage {
  let content: string;

  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    content = msg.content
      .map((part: ContentPart) => {
        if (!part || typeof part !== 'object') return '';
        if (part.type === 'text') return part.text || '';
        try {
          return JSON.stringify(part) ?? '';
        } catch {
          return '';
        }
      })
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
 * Drop UI file parts that carry no resolvable `url` BEFORE convertToModelMessages().
 *
 * The SDK maps every `type:'file'`/`'reasoning-file'` part through `new URL(part.url)`,
 * so a part shaped `{type:'file', name, mimeType, data}` (what the composer merges in
 * for attachments) throws `TypeError: Invalid URL` and kills the whole turn — most
 * visibly when pasting long text, which the composer turns into a text attachment.
 *
 * Nothing is lost: file parts are dropped again after conversion by
 * sanitizeContentPartsForModel(), and the file content reaches the model through
 * processAttachments() → attachmentContext.
 */
export function sanitizeUIFileParts<T extends { parts?: unknown }>(
  messages: readonly T[]
): {
  messages: T[];
  droppedFileParts: number;
} {
  let droppedFileParts = 0;

  const sanitized = messages.map((message) => {
    if (!Array.isArray(message.parts)) return message;

    const parts = message.parts as Array<Record<string, unknown> | null>;
    const kept = parts.filter((part) => {
      if (!part || typeof part !== 'object') return true;
      if (part.type !== 'file' && part.type !== 'reasoning-file') return true;
      if (part.providerReference != null) return true;
      if (typeof part.url === 'string' && part.url.length > 0) return true;
      droppedFileParts++;
      return false;
    });

    if (kept.length === parts.length) return message;
    return { ...message, parts: kept } as T;
  });

  return { messages: sanitized, droppedFileParts };
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
