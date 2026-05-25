import { useLocalRuntime } from '@assistant-ui/react-native';
import { createNotebookModelAdapter, type NotebookAdapterConfig } from '@gruenerator/chat';
import { useMemo } from 'react';

/**
 * Notebook chat runtime for mobile. Reuses the SAME adapter web uses
 * (`createNotebookModelAdapter`) so it POSTs to `/api/chat-service/notebook/stream`
 * — the endpoint that already does filtered RAG over a notebook's collections.
 * No backend changes: `configureMobileChat()` supplies the fetch/auth, and the
 * adapter sends `collectionIds` + `filters` + `mode` straight through.
 *
 * `getConfig` must be referentially stable (build it with refs in the caller) so
 * the adapter — and therefore the runtime — is created once and isn't reset when
 * filters/mode change mid-conversation.
 */
export function useNotebookChatRuntime(
  getConfig: () => NotebookAdapterConfig,
  onThreadCreated?: (threadId: string) => void
) {
  const adapter = useMemo(
    () => createNotebookModelAdapter(getConfig, onThreadCreated ? { onThreadCreated } : {}),
    [getConfig, onThreadCreated]
  );
  return useLocalRuntime(adapter);
}
