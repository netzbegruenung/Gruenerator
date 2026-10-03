import {
  ExportedMessageRepository,
  type ChatModelRunOptions,
  type ChatModelRunResult,
} from '@assistant-ui/react';

import { splitLiveTurn } from '../runtime/resumableStream';
import {
  convertNotebookLoadedMessages,
  type LoadedMessage,
} from '../runtime/threadMessageConversion';
import { useChatConfigStore } from '../stores/chatConfigStore';

import type { NotebookModelAdapter } from '../runtime/NotebookModelAdapter';

/**
 * Loads a notebook conversation back from the server.
 *
 * Notebook answers have always been persisted (`notebookStreamController`
 * writes both the question and the answer), but the notebook surface had no way
 * to read them: its runtime was created without a history adapter, so every
 * older conversation opened as a blank start page and looked deleted.
 *
 * Reuses the chat surface's messages endpoint — the rows are the same, only
 * their metadata is notebook-shaped, which is what the conversion handles.
 * `append` stays empty for the same reason it is empty on the chat side: the
 * backend persists each turn as it streams.
 *
 * A turn still running when the conversation loads is taken out of the history
 * and resumed through the model adapter (`unstable_resume` → `resume`).
 */
export function createNotebookHistoryAdapter(
  threadId: string,
  resumeTurn?: NotebookModelAdapter['resume']
) {
  let pendingResume: { streamId: string; partialText: string } | null = null;
  return {
    async load() {
      try {
        const { fetch: configFetch } = useChatConfigStore.getState();
        const response = await configFetch(
          `/api/chat-service/messages?threadId=${encodeURIComponent(threadId)}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { rows, live } = splitLiveTurn((await response.json()) as LoadedMessage[]);
        pendingResume = resumeTurn ? live : null;
        const repository = ExportedMessageRepository.fromArray(convertNotebookLoadedMessages(rows));
        return pendingResume ? { ...repository, unstable_resume: true } : repository;
      } catch (error) {
        // A conversation that cannot be loaded should still leave a usable
        // notebook — the start page is a fair fallback.
        console.warn('[NotebookHistory] Failed to load messages:', error);
        return { messages: [] };
      }
    },
    async append() {
      // The backend persists notebook turns from the SSE handler.
    },
    async *resume(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const live = pendingResume;
      pendingResume = null;
      if (live && resumeTurn) yield* resumeTurn(live.streamId, live.partialText, options);
    },
  };
}
