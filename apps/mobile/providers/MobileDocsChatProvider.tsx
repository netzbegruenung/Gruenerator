import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { useChatConfigStore, type ChatRequestContext } from '@gruenerator/chat';
import { type ReactNode, useEffect, useRef } from 'react';

import { useMobileDocsChatRuntime } from '../hooks/useMobileDocsChatRuntime';
import { configureMobileChat } from '../services/chatConfig';
import { useDocsEditorBridgeStore } from '../stores/docsEditorBridgeStore';

interface MobileDocsChatProviderProps {
  documentId: string;
  documentTitle: string;
  children: ReactNode;
}

/**
 * Scopes the in-document AI assistant. Uses an isolated runtime (NOT the global
 * useAgentStore) and feeds the open document's markdown + selection into each
 * request via a context provider.
 *
 * Keying: GrueneratorModelAdapter only consults the provider when config.threadId
 * is truthy (`if (config.threadId) contextProviders.get(config.threadId)`), and the
 * docs runtime's config emits exactly this threadId. So we register under the real
 * thread id once useMobileDocsChatRuntime surfaces it; doc context is then attached
 * to every follow-up request. KNOWN LIMITATION (Phase 1): the very first message is
 * sent with threadId === null, so the adapter skips provider lookup and that message
 * carries no document context — the assistant gets the doc from the second turn on.
 * Fixing the first turn would require the shared adapter to also consult a null/'new'
 * fallback key; intentionally not changed here.
 */
export function MobileDocsChatProvider({
  documentId,
  documentTitle,
  children,
}: MobileDocsChatProviderProps) {
  const configuredRef = useRef<boolean>(null);
  if (configuredRef.current == null) {
    configureMobileChat();
    configuredRef.current = true;
  }

  const { runtime, threadId } = useMobileDocsChatRuntime();

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const documentTitleRef = useRef(documentTitle);
  documentTitleRef.current = documentTitle;

  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => ({
      currentDocument: {
        id: documentIdRef.current,
        title: documentTitleRef.current.trim() || null,
        markdown: useDocsEditorBridgeStore.getState().docMarkdown,
        selectionText: useDocsEditorBridgeStore.getState().docSelectionText,
      },
    });
    return useChatConfigStore.getState().registerContextProvider(threadId ?? 'new', provider);
  }, [threadId]);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
