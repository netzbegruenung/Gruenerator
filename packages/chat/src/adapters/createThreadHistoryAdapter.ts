import { type ThreadMessageLike } from '@assistant-ui/react';

import { type ChatApiClient } from '../context/ChatContext';

export interface LoadedMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: {
    intent?: string;
    searchCount?: number;
    citations?: Array<{
      id: number;
      title: string;
      url: string;
      snippet?: string;
      domain?: string;
    }>;
    searchResults?: Array<{ title: string; url: string; snippet?: string }>;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
    }>;
  };
}

export interface ThreadHistoryAdapter {
  load(): Promise<{
    messages: Array<{
      parentId: string | null;
      message: { id: string; [key: string]: unknown };
    }>;
  }>;
  append(): Promise<void>;
}

export function createThreadHistoryAdapter(
  remoteId: string,
  apiClient: ChatApiClient,
  convertFn: (msgs: LoadedMessage[]) => ThreadMessageLike[],
  transformFn: (msg: ThreadMessageLike) => { id: string; [key: string]: unknown }
): ThreadHistoryAdapter {
  return {
    async load() {
      try {
        const msgs = await apiClient.get<LoadedMessage[]>(
          `/api/chat-service/messages?threadId=${remoteId}`
        );
        const converted = convertFn(msgs);
        const transformed = converted.map(transformFn);
        return {
          messages: transformed.map((m, idx) => ({
            parentId: idx > 0 ? transformed[idx - 1]!.id : null,
            message: m,
          })),
        };
      } catch (error) {
        console.warn('[HistoryAdapter] Failed to load messages:', error);
        return { messages: [] };
      }
    },
    async append() {
      // Backend persists messages via the SSE stream handler
    },
  };
}
