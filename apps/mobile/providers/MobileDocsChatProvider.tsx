import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { useChatConfigStore, type ChatRequestContext } from '@gruenerator/chat';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
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
 * docs runtime's config emits exactly this threadId. To make the VERY FIRST message
 * carry document context, we resolve the per-document thread eagerly (get-or-create,
 * GET /api/docs/:id/chat-thread) — mirroring web's DocsChatProvider — and seed it
 * into the runtime. The provider is then registered under that stable id, so doc
 * context attaches from message #1.
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

  // Eagerly resolve the stable per-document thread id (mirrors web).
  const { data: docThreadId = null } = useQuery({
    queryKey: ['docs', documentId, 'chat-thread'],
    queryFn: async () => {
      const result = await getContractsClient().docs.getChatThread({ params: { id: documentId } });
      if (result.status !== 200) throw new Error(`Chat thread lookup failed: ${result.status}`);
      return result.body.threadId;
    },
    staleTime: 5 * 60_000,
  });

  const { runtime, threadId } = useMobileDocsChatRuntime(docThreadId);

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const documentTitleRef = useRef(documentTitle);
  documentTitleRef.current = documentTitle;

  useEffect(() => {
    if (!threadId) return;
    const provider = async (): Promise<ChatRequestContext> => ({
      currentDocument: {
        id: documentIdRef.current,
        title: documentTitleRef.current.trim() || null,
        markdown: useDocsEditorBridgeStore.getState().docMarkdown,
        selectionText: useDocsEditorBridgeStore.getState().docSelectionText,
      },
    });
    return useChatConfigStore.getState().registerContextProvider(threadId, provider);
  }, [threadId]);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
