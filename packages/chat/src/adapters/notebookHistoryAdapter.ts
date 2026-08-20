import { ExportedMessageRepository } from '@assistant-ui/react';

import {
  convertNotebookLoadedMessages,
  type LoadedMessage,
} from '../runtime/threadMessageConversion';
import { useChatConfigStore } from '../stores/chatConfigStore';

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
 */
export function createNotebookHistoryAdapter(threadId: string) {
  return {
    async load() {
      try {
        const { fetch: configFetch } = useChatConfigStore.getState();
        const response = await configFetch(
          `/api/chat-service/messages?threadId=${encodeURIComponent(threadId)}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = (await response.json()) as LoadedMessage[];
        return ExportedMessageRepository.fromArray(convertNotebookLoadedMessages(rows));
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
  };
}
