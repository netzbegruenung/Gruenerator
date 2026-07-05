'use client';

import {
  AssistantRuntimeProvider,
  AuiProvider,
  ExportedMessageRepository,
  useAui,
  useLocalRuntime,
  type AssistantRuntime,
} from '@assistant-ui/react';
import {
  AUTO_MODEL_ID,
  ChatCollaborationProvider,
  ChatSurfaceProvider,
  GrueneratorAttachmentAdapter,
  convertToThreadMessageLike,
  createChatSurfaceStore,
  createGrueneratorModelAdapter,
  resolveAutoModel,
  useChatCollaboration,
  useChatConfigStore,
  type ChatRequestContext,
  type ChatSurfaceStore,
  type GrueneratorAdapterConfig,
} from '@gruenerator/chat';
import { chatThreadResponseSchema, type ChatThreadResponse } from '@gruenerator/contracts';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { applySheetOperations, serializeSheetContext, type FUniver } from '@gruenerator/sheets';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { useDocAiEditEnabled } from '../docs/DocAiEditToggle';
import { usePeerMessageSync } from '../docs/usePeerMessageSync';

type ChatCollabValue = ReturnType<typeof useChatCollaboration>;

export type SheetsChatState =
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

const SheetsChatContext = createContext<SheetsChatState | null>(null);

export function useSheetsChat(): SheetsChatState {
  const value = useContext(SheetsChatContext);
  if (!value) {
    throw new Error('useSheetsChat must be used inside <SheetsChatProvider>');
  }
  return value;
}

interface SheetsChatProviderProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  /** Live Univer facade from the mounted editor (null while loading). */
  univerAPI: FUniver | null;
  children: ReactNode;
}

export function SheetsChatProvider({
  documentId,
  userId,
  userName,
  documentTitle,
  univerAPI,
  children,
}: SheetsChatProviderProps) {
  if (!userId) {
    return (
      <SheetsChatContext.Provider value={{ status: 'guest' }}>
        {children}
      </SheetsChatContext.Provider>
    );
  }
  return (
    <SheetsAuiReset>
      <SheetsChatProviderInner
        documentId={documentId}
        userId={userId}
        userName={userName}
        documentTitle={documentTitle}
        univerAPI={univerAPI}
      >
        {children}
      </SheetsChatProviderInner>
    </SheetsAuiReset>
  );
}

function SheetsAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

interface InnerProps extends Omit<SheetsChatProviderProps, 'userId'> {
  userId: string;
}

function SheetsChatProviderInner({
  documentId,
  userId,
  userName,
  documentTitle,
  univerAPI,
  children,
}: InnerProps) {
  // Same thread mechanism as docs — the endpoint is subtype-agnostic.
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
      <SheetsChatContext.Provider
        value={{
          status: 'error',
          error: threadError instanceof Error ? threadError : new Error(String(threadError)),
        }}
      >
        {children}
      </SheetsChatContext.Provider>
    );
  }

  if (threadLoading || !threadId) {
    return (
      <SheetsChatContext.Provider value={{ status: 'loading' }}>
        {children}
      </SheetsChatContext.Provider>
    );
  }

  return (
    <SheetsChatReadyHost
      key={threadId}
      threadId={threadId}
      documentId={documentId}
      userId={userId}
      userName={userName}
      documentTitle={documentTitle}
      univerAPI={univerAPI}
    >
      {children}
    </SheetsChatReadyHost>
  );
}

interface ReadyHostProps extends Omit<InnerProps, 'children'> {
  threadId: string;
  children: ReactNode;
}

function SheetsChatReadyHost({
  threadId,
  documentId,
  userId,
  userName,
  documentTitle,
  univerAPI,
  children,
}: ReadyHostProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);
  const registerDocumentEditHandler = useChatConfigStore((s) => s.registerDocumentEditHandler);

  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);
  const aiEditEnabledRef = useRef(aiEditEnabled);
  aiEditEnabledRef.current = aiEditEnabled;
  const univerAPIRef = useRef(univerAPI);
  univerAPIRef.current = univerAPI;

  const { data: initialMessages } = useQuery({
    queryKey: ['chat-thread-messages', threadId],
    queryFn: async () => {
      const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
      if (!res.ok) return [];
      const parsed = loadedThreadMessagesSchema.parse(await res.json());
      return convertToThreadMessageLike(parsed as Parameters<typeof convertToThreadMessageLike>[0]);
    },
    staleTime: 30_000,
  });

  // Per-thread context provider: feed the current sheet (markdown with A1
  // coordinates) through the same currentDocument channel docs use, so the
  // classifier and respond node work unchanged.
  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => {
      const api = univerAPIRef.current;
      const workbook = api?.getActiveWorkbook();
      if (!workbook) return {};
      return {
        currentDocument: {
          id: documentId,
          title: documentTitle?.trim() || null,
          markdown: serializeSheetContext(workbook),
          selectionText: null,
        },
      };
    };
    return registerContextProvider(threadId, provider);
  }, [threadId, documentId, documentTitle, registerContextProvider]);

  // Sheet edit handler: the ChatGraph classifies edit_current_doc and emits
  // trigger_doc_edit keyed by targetDocumentId — our registration under the
  // sheet's documentId routes it here instead of BlockNote. Plan operations
  // via /api/sheets/:id/ai, then apply them through the Facade API (they flow
  // through the collab bridge and the native undo stack).
  useEffect(() => {
    return registerDocumentEditHandler(documentId, async (payload) => {
      if (payload.targetDocumentId !== documentId) return;
      const { toast } = await import('sonner');
      if (!aiEditEnabledRef.current) {
        toast.info('KI-Bearbeitung ist deaktiviert — es wurde nichts an der Tabelle geändert.');
        return;
      }
      const workbook = univerAPIRef.current?.getActiveWorkbook();
      if (!workbook) {
        toast.error('Die Tabelle ist noch nicht geladen.');
        return;
      }
      try {
        const result = await getContractsClient().sheets.ai({
          params: { id: documentId },
          body: {
            userPrompt: payload.userPrompt,
            sheetContext: serializeSheetContext(workbook),
            ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
          },
        });
        if (result.status === 401) {
          // Session died mid-edit. The contracts client already routed this
          // through onUnauthorized (probe → redirect on a dead session); show a
          // clear message instead of the generic failure toast — and never let a
          // transparently-retried write fall through to a false success toast.
          toast.error('Sitzung abgelaufen — bitte neu anmelden.');
          return;
        }
        if (result.status !== 200) {
          toast.error('Tabellen-Aktion fehlgeschlagen.');
          return;
        }
        if (result.body.operations.length === 0) {
          toast.info('Es wurde keine Tabellen-Änderung erkannt — nichts wurde geändert.');
          return;
        }
        const { applied, skipped } = applySheetOperations(workbook, result.body.operations);
        if (applied > 0) {
          toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`);
        }
        if (skipped.length > 0) {
          toast.warning(skipped.join(' · '));
        }
      } catch (err) {
        toast.error(
          `Tabellen-Aktion fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
        );
      }
    });
  }, [documentId, registerDocumentEditHandler]);

  const surfaceStore = useMemo<ChatSurfaceStore>(
    () =>
      createChatSurfaceStore({
        selectedAgentId: 'gruenerator-sheets-editor',
        threadMode: 'chat',
        searchMode: 'web',
      }),
    []
  );

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const getConfig = useMemo<() => GrueneratorAdapterConfig>(
    () => () => {
      const surface = surfaceStore.getState();
      const resolvedModelId =
        surface.selectedModel === AUTO_MODEL_ID
          ? resolveAutoModel({
              threadMode: surface.threadMode,
              agent: surface.selectedAgentId
                ? (getSystemAgent(surface.selectedAgentId) ?? null)
                : null,
            })
          : (surface.selectedModel ?? '');
      return {
        agentId: surface.selectedAgentId ?? 'gruenerator-sheets-editor',
        modelId: resolvedModelId,
        enabledTools: {
          search: true,
          web: true,
          examples: false,
          pressemitteilung_examples: false,
          research: true,
        },
        customEnabledTools: {
          summary: true,
          edit_current_doc: aiEditEnabledRef.current,
        },
        threadId: threadIdRef.current,
        threadMode: surface.threadMode,
        searchMode: surface.searchMode,
        selectedNotebookId: surface.selectedNotebookId,
        customSystemPrompt: surface.customSystemPrompt,
        customRoleName: surface.customRoleName,
      };
    },
    [surfaceStore]
  );

  const adapter = useMemo(() => createGrueneratorModelAdapter(getConfig, {}), [getConfig]);
  const attachmentAdapter = useMemo(() => new GrueneratorAttachmentAdapter(), []);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: initialMessages ?? [],
    adapters: { attachments: attachmentAdapter },
  });

  const importedRef = useRef(false);
  useEffect(() => {
    if (importedRef.current) return;
    if (!initialMessages || initialMessages.length === 0) return;
    if (runtime.thread.getState().isRunning) return;
    runtime.thread.import(ExportedMessageRepository.fromArray(initialMessages));
    importedRef.current = true;
  }, [initialMessages, runtime]);

  const collabUser = useMemo(() => ({ id: userId, name: userName ?? userId }), [userId, userName]);
  const collab = useChatCollaboration(threadId, collabUser);

  usePeerMessageSync({ threadId, runtime, collab });

  const value = useMemo<SheetsChatState>(
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
    <SheetsChatContext.Provider value={value}>
      <ChatSurfaceProvider store={surfaceStore}>
        <AssistantRuntimeProvider runtime={runtime}>
          <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>
        </AssistantRuntimeProvider>
      </ChatSurfaceProvider>
    </SheetsChatContext.Provider>
  );
}
