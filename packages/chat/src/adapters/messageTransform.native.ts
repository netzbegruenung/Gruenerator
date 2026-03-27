import { type ThreadMessageLike, type ThreadMessage } from '@assistant-ui/react-native';
import {
  fromThreadMessageLike,
  getAutoStatus,
  generateId,
} from '@assistant-ui/react-native/internal';

import { INTENT_TO_TOOL } from '../lib/toolMappings';

import { type LoadedMessage } from './createThreadHistoryAdapter';

function extractContent(content: unknown): string {
  if (typeof content !== 'string') return '';

  if (content.startsWith('[{') && content.includes('"type":"text"')) {
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        return parts
          .filter(
            (p: unknown): p is { type: string; text: string } =>
              p !== null && typeof p === 'object' && 'type' in p && p.type === 'text' && 'text' in p
          )
          .map((p) => p.text)
          .join('');
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return content;
}

export function convertToThreadMessageLike(messages: LoadedMessage[]): ThreadMessageLike[] {
  return messages.map((m) => {
    const textContent = extractContent(m.content);

    type ToolCallLike = {
      readonly type: 'tool-call';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: Record<string, string>;
      readonly result?: unknown;
    };

    const contentParts: Array<{ type: 'text'; text: string } | ToolCallLike> = [];

    if (m.metadata?.toolCalls) {
      for (const tc of m.metadata.toolCalls) {
        contentParts.push({
          type: 'tool-call' as const,
          toolCallId: tc.toolCallId || `tc_${m.id}`,
          toolName: tc.toolName,
          args: { query: String((tc.args as Record<string, unknown>)?.query ?? '') },
          result: tc.result,
        });
      }
    } else if (m.role === 'assistant' && m.metadata?.intent && m.metadata.searchResults?.length) {
      const toolName = INTENT_TO_TOOL[m.metadata.intent];
      if (toolName) {
        contentParts.push({
          type: 'tool-call' as const,
          toolCallId: `tc_legacy_${m.id}`,
          toolName,
          args: { query: '' },
          result: { results: m.metadata.searchResults },
        });
      }
    }

    contentParts.push({ type: 'text' as const, text: textContent });

    const custom: Record<string, unknown> = {};
    if (m.metadata?.citations) custom.citations = m.metadata.citations;
    if (m.metadata?.intent)
      custom.streamMetadata = {
        intent: m.metadata.intent,
        searchCount: m.metadata.searchCount ?? 0,
      };

    return {
      role: m.role as 'user' | 'assistant',
      content: contentParts,
      id: m.id,
      metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
    };
  });
}

export function transformMessageLike(msg: ThreadMessageLike): ThreadMessage {
  return fromThreadMessageLike(
    msg,
    generateId(),
    getAutoStatus(false, false, false, false, undefined)
  );
}
