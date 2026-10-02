import { type ChatApiClient } from '../context/ChatContext';

import { type LoadedMessage } from './messageConversion';

export { type LoadedMessage } from './messageConversion';

export interface ThreadHistoryAdapter<TMessage extends { id: string } = { id: string }> {
  load(): Promise<{
    messages: Array<{ parentId: string | null; message: TMessage }>;
  }>;
  append(): Promise<void>;
}

/** `TRow` is the row shape the converter reads — the chat surface's
 *  `LoadedMessage` by default, the notebook converter's own for notebook
 *  threads. Both are the same `/messages` rows, typed for their reader. */
export function createThreadHistoryAdapter<
  TMessageLike,
  TMessage extends { id: string },
  TRow = LoadedMessage,
>(
  remoteId: string,
  apiClient: ChatApiClient,
  convertFn: (msgs: TRow[]) => TMessageLike[],
  transformFn: (msg: TMessageLike) => TMessage
): ThreadHistoryAdapter<TMessage> {
  return {
    async load() {
      try {
        const msgs = await apiClient.get<TRow[]>(`/api/chat-service/messages?threadId=${remoteId}`);
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
