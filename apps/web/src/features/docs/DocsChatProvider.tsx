'use client';

import {
  AssistantRuntimeProvider,
  AuiProvider,
  useAui,
  useLocalRuntime,
  type AssistantRuntime,
} from '@assistant-ui/react';
import {
  ChatCollaborationProvider,
  GrueneratorAttachmentAdapter,
  convertToThreadMessageLike,
  createGrueneratorModelAdapter,
  useAgentStore,
  useChatCollaboration,
  useChatConfigStore,
  type ChatRequestContext,
  type GrueneratorAdapterConfig,
} from '@gruenerator/chat';
import { chatThreadResponseSchema, type ChatThreadResponse } from '@gruenerator/contracts';
import { invokeDocumentAI, useEditorStore } from '@gruenerator/docs';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { useDocAiEditEnabled } from './DocAiEditToggle';
import { usePeerMessageSync } from './usePeerMessageSync';

type ChatCollabValue = ReturnType<typeof useChatCollaboration>;

export type DocsChatState =
  | { status: 'guest' }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | {
      status: 'ready';
      threadId: string;
      runtime: AssistantRuntime;
      collab: ChatCollabValue;
      aiEditEnabled: boolean;
      toggleAiEdit: () => void;
      documentId: string;
      userName: string | null;
    };

const DocsChatContext = createContext<DocsChatState | null>(null);

export function useDocsChat(): DocsChatState {
  const value = useContext(DocsChatContext);
  if (!value) {
    throw new Error('useDocsChat must be used inside <DocsChatProvider>');
  }
  return value;
}

interface DocsChatProviderProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  children: ReactNode;
}

export function DocsChatProvider({
  documentId,
  userId,
  userName,
  children,
}: DocsChatProviderProps) {
  if (!userId) {
    return (
      <DocsChatContext.Provider value={{ status: 'guest' }}>{children}</DocsChatContext.Provider>
    );
  }
  return (
    <DocsAuiReset>
      <DocsChatProviderInner documentId={documentId} userId={userId} userName={userName}>
        {children}
      </DocsChatProviderInner>
    </DocsAuiReset>
  );
}

function DocsAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

interface InnerProps {
  documentId: string;
  userId: string;
  userName: string | null;
  children: ReactNode;
}

function DocsChatProviderInner({ documentId, userId, userName, children }: InnerProps) {
  const {
    data: threadResp,
    error: threadError,
    isLoading: threadLoading,
  } = useQuery<ChatThreadResponse>({
    queryKey: ['docs', documentId, 'chat-thread'],
    queryFn: async () => {
      const result = await getContractsClient().docs.getChatThread({
        params: { id: documentId },
      });
      if (result.status !== 200) {
        throw new Error(`Chat thread lookup failed: ${result.status}`);
      }
      return chatThreadResponseSchema.parse(result.body);
    },
    staleTime: 5 * 60_000,
  });

  const threadId = threadResp?.threadId ?? null;

  if (threadError) {
    return (
      <DocsChatContext.Provider
        value={{
          status: 'error',
          error: threadError instanceof Error ? threadError : new Error(String(threadError)),
        }}
      >
        {children}
      </DocsChatContext.Provider>
    );
  }

  if (threadLoading || !threadId) {
    return (
      <DocsChatContext.Provider value={{ status: 'loading' }}>{children}</DocsChatContext.Provider>
    );
  }

  return (
    <DocsChatReadyHost
      key={threadId}
      threadId={threadId}
      documentId={documentId}
      userId={userId}
      userName={userName}
    >
      {children}
    </DocsChatReadyHost>
  );
}

interface ReadyHostProps {
  threadId: string;
  documentId: string;
  userId: string;
  userName: string | null;
  children: ReactNode;
}

function DocsChatReadyHost({
  threadId,
  documentId,
  userId,
  userName,
  children,
}: ReadyHostProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);
  const registerDocumentEditHandler = useChatConfigStore((s) => s.registerDocumentEditHandler);

  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);
  const aiEditEnabledRef = useRef(aiEditEnabled);
  aiEditEnabledRef.current = aiEditEnabled;

  const { data: initialMessages } = useQuery({
    queryKey: ['chat-thread-messages', threadId],
    queryFn: async () => {
      const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
      if (!res.ok) return [];
      const parsed = loadedThreadMessagesSchema.parse(await res.json());
      return convertToThreadMessageLike(
        parsed as Parameters<typeof convertToThreadMessageLike>[0]
      );
    },
    staleTime: 30_000,
  });

  // Per-thread context provider: feed current document markdown + selection.
  // Lives for the doc's lifetime so it stays subscribed even when the chat
  // panel is closed.
  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => {
      const editor = useEditorStore.getState().getEditor(documentId);
      if (!editor) return {};
      const markdown = editor.blocksToMarkdownLossy(editor.document);
      const selection = editor.getSelectedText() || null;
      return {
        currentDocument: {
          id: documentId,
          title: null,
          markdown,
          selectionText: selection,
        },
      };
    };
    return registerContextProvider(threadId, provider);
  }, [threadId, documentId, registerContextProvider]);

  // Claim selectedAgentId for the doc's lifetime; restore on unmount.
  useEffect(() => {
    const previous = useAgentStore.getState().selectedAgentId;
    useAgentStore.setState({ selectedAgentId: 'gruenerator-docs-editor' });
    return () => {
      useAgentStore.setState({ selectedAgentId: previous });
    };
  }, []);

  useEffect(() => {
    return registerDocumentEditHandler(documentId, async (payload) => {
      if (payload.targetDocumentId !== documentId) return;
      if (!aiEditEnabledRef.current) return;
      await invokeDocumentAI({
        documentId,
        userPrompt: payload.userPrompt,
        useSelection: payload.useSelection,
        ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
      });
    });
  }, [documentId, registerDocumentEditHandler]);

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const getConfig = useMemo<() => GrueneratorAdapterConfig>(
    () => () => ({
      agentId: 'gruenerator-docs-editor',
      modelId: '',
      enabledTools: {
        search: true,
        web: true,
        examples: true,
        pressemitteilung_examples: false,
        research: true,
      },
      customEnabledTools: {
        summary: true,
        edit_current_doc: aiEditEnabledRef.current,
        save_as_doc: true,
        image: true,
        chart: true,
      },
      threadId: threadIdRef.current,
      threadMode: 'chat',
    }),
    []
  );

  const adapter = useMemo(() => createGrueneratorModelAdapter(getConfig, {}), [getConfig]);
  const attachmentAdapter = useMemo(() => new GrueneratorAttachmentAdapter(), []);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: initialMessages ?? [],
    adapters: { attachments: attachmentAdapter },
  });

  const collabUser = useMemo(
    () => ({ id: userId, name: userName ?? userId }),
    [userId, userName]
  );
  const collab = useChatCollaboration(threadId, collabUser);

  // Multi-user message sync via Hocuspocus awareness (append-on-complete).
  usePeerMessageSync({ threadId, runtime, collab });

  const value = useMemo<DocsChatState>(
    () => ({
      status: 'ready',
      threadId,
      runtime,
      collab,
      aiEditEnabled,
      toggleAiEdit,
      documentId,
      userName,
    }),
    [threadId, runtime, collab, aiEditEnabled, toggleAiEdit, documentId, userName]
  );

  return (
    <DocsChatContext.Provider value={value}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>
      </AssistantRuntimeProvider>
    </DocsChatContext.Provider>
  );
}
