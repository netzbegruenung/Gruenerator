/**
 * Message preprocessing helpers (skeleton) to keep worker adapters lean
 */

import type { MessagePreprocessingInput, OpenAIMessage } from './types.js';

/**
 * Convert messages to OpenAI-compatible format
 */
export function toOpenAICompatibleMessages({ systemPrompt, messages }: MessagePreprocessingInput): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];

  if (systemPrompt) {
    out.push({ role: 'system', content: systemPrompt });
  }

  if (Array.isArray(messages)) {
    messages.forEach((msg) => {
      out.push({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(c => c.text || c.content || '').join('\n')
            : String(msg.content || '')
      });
    });
  }

  return out;
}

export default { toOpenAICompatibleMessages };
