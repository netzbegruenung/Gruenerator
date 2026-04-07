import { type ChatApiClient } from '../context/ChatContext';

export { type LoadedMessage } from './messageTransform';

export interface ThreadHistoryAdapter<TMessage extends { id: string } = { id: string }> {
  load(): Promise<{
    messages: Array<{ parentId: string | null; message: TMessage }>;
  }>;
  append(): Promise<void>;
}

export function createThreadHistoryAdapter<TMessageLike, TMessage extends { id: string }>(
  remoteId: string,
  apiClient: ChatApiClient,
  convertFn: (msgs: import('./messageTransform').LoadedMessage[]) => TMessageLike[],
  transformFn: (msg: TMessageLike) => TMessage
): ThreadHistoryAdapter<TMessage> {
  return {
    async load() {
      try {
        const msgs = await apiClient.get<import('./messageTransform').LoadedMessage[]>(
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
