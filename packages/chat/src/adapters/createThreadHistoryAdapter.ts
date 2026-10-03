import { type ChatApiClient } from '../context/ChatContext';
import { splitLiveTurn } from '../runtime/resumableStream';

import { type LoadedMessage } from './messageConversion';

import type { ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';

export { type LoadedMessage } from './messageConversion';

export interface ThreadHistoryAdapter<TMessage extends { id: string } = { id: string }> {
  load(): Promise<{
    messages: Array<{ parentId: string | null; message: TMessage }>;
    unstable_resume?: boolean;
  }>;
  append(): Promise<void>;
  resume(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void>;
}

/** Re-attaches to a turn that was still running when the thread loaded —
 *  `resumeChatTurn` for chat threads, the notebook adapter's `resume`. */
export type ResumeTurn = (
  streamId: string,
  partialText: string,
  options: ChatModelRunOptions
) => AsyncGenerator<ChatModelRunResult, void>;

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
  transformFn: (msg: TMessageLike) => TMessage,
  resumeTurn?: ResumeTurn
): ThreadHistoryAdapter<TMessage> {
  let pendingResume: { streamId: string; partialText: string } | null = null;
  return {
    async load() {
      try {
        const loaded = await apiClient.get<TRow[]>(
          `/api/chat-service/messages?threadId=${remoteId}`
        );
        // Rows are typed for their converter; the live check reads only the
        // common `/messages` fields every row has.
        const { rows, live } = splitLiveTurn(loaded as unknown as LoadedMessage[]);
        pendingResume = resumeTurn ? live : null;
        const converted = convertFn(rows as unknown as TRow[]);
        const transformed = converted.map(transformFn);
        return {
          messages: transformed.map((m, idx) => ({
            parentId: idx > 0 ? transformed[idx - 1]!.id : null,
            message: m,
          })),
          ...(pendingResume && { unstable_resume: true }),
        };
      } catch (error) {
        console.warn('[HistoryAdapter] Failed to load messages:', error);
        return { messages: [] };
      }
    },
    async append() {
      // Backend persists messages via the SSE stream handler
    },
    async *resume(options) {
      const live = pendingResume;
      pendingResume = null;
      if (live && resumeTurn) yield* resumeTurn(live.streamId, live.partialText, options);
    },
  };
}
