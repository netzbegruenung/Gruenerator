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
import {
  applyPresentationOperations,
  getSlidesArray,
  serializePresentationContext,
  yMapToSlide,
} from '@gruenerator/presentations';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { type Doc as YDoc } from 'yjs';

import { useDocAiEditEnabled } from '../docs/DocAiEditToggle';
import { usePeerMessageSync } from '../docs/usePeerMessageSync';

type ChatCollabValue = ReturnType<typeof useChatCollaboration>;

export type PresentationsChatState =
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

const PresentationsChatContext = createContext<PresentationsChatState | null>(null);

export function usePresentationsChat(): PresentationsChatState {
  const value = useContext(PresentationsChatContext);
  if (!value) {
    throw new Error('usePresentationsChat must be used inside <PresentationsChatProvider>');
  }
  return value;
}

function readSlides(ydoc: YDoc) {
  return getSlidesArray(ydoc)
    .toArray()
    .map((m) => yMapToSlide(m));
}

interface PresentationsChatProviderProps {
  documentId: string;
  userId: string | null;
  userName: string | null;
  documentTitle: string | null;
  /** Live deck YDoc from the mounted editor (null while loading). */
  ydoc: YDoc | null;
  children: ReactNode;
}

export function PresentationsChatProvider({
  documentId,
  userId,
  userName,
  documentTitle,
  ydoc,
  children,
}: PresentationsChatProviderProps) {
  if (!userId) {
    return (
      <PresentationsChatContext.Provider value={{ status: 'guest' }}>
        {children}
      </PresentationsChatContext.Provider>
    );
  }
  return (
    <PresentationsAuiReset>
      <PresentationsChatProviderInner
        documentId={documentId}
        userId={userId}
        userName={userName}
        documentTitle={documentTitle}
        ydoc={ydoc}
      >
        {children}
      </PresentationsChatProviderInner>
    </PresentationsAuiReset>
  );
}

function PresentationsAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

interface InnerProps extends Omit<PresentationsChatProviderProps, 'userId'> {
  userId: string;
}

function PresentationsChatProviderInner({
  documentId,
  userId,
  userName,
  documentTitle,
  ydoc,
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
      <PresentationsChatContext.Provider
        value={{
          status: 'error',
          error: threadError instanceof Error ? threadError : new Error(String(threadError)),
        }}
      >
        {children}
      </PresentationsChatContext.Provider>
    );
  }

  if (threadLoading || !threadId) {
    return (
      <PresentationsChatContext.Provider value={{ status: 'loading' }}>
        {children}
      </PresentationsChatContext.Provider>
    );
  }

  return (
    <PresentationsChatReadyHost
      key={threadId}
      threadId={threadId}
      documentId={documentId}
      userId={userId}
      userName={userName}
      documentTitle={documentTitle}
      ydoc={ydoc}
    >
      {children}
    </PresentationsChatReadyHost>
  );
}

interface ReadyHostProps extends Omit<InnerProps, 'children'> {
  threadId: string;
  children: ReactNode;
}

function PresentationsChatReadyHost({
  threadId,
  documentId,
  userId,
  userName,
  documentTitle,
  ydoc,
  children,
}: ReadyHostProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);
  const registerDocumentEditHandler = useChatConfigStore((s) => s.registerDocumentEditHandler);

  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useDocAiEditEnabled(documentId);
  const aiEditEnabledRef = useRef(aiEditEnabled);
  aiEditEnabledRef.current = aiEditEnabled;
  const ydocRef = useRef(ydoc);
  ydocRef.current = ydoc;
  const titleRef = useRef(documentTitle);
  titleRef.current = documentTitle;

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

  // Per-thread context provider: feed the current deck (numbered markdown
  // outline) through the same currentDocument channel docs use, so the
  // classifier and respond node work unchanged.
  useEffect(() => {
    const provider = async (): Promise<ChatRequestContext> => {
      const doc = ydocRef.current;
      if (!doc) return {};
      return {
        currentDocument: {
          id: documentId,
          title: titleRef.current?.trim() || null,
          markdown: serializePresentationContext(readSlides(doc), titleRef.current?.trim() || ''),
          selectionText: null,
        },
      };
    };
    return registerContextProvider(threadId, provider);
  }, [threadId, documentId, registerContextProvider]);

  // Deck edit handler: the ChatGraph classifies edit_current_doc and emits
  // trigger_doc_edit keyed by targetDocumentId — our registration under the
  // deck's documentId routes it here. Plan operations via
  // /api/presentations/:id/ai, then apply them to the YDoc (they flow through
  // collab and the Yjs undo manager).
  useEffect(() => {
    return registerDocumentEditHandler(documentId, async (payload) => {
      if (payload.targetDocumentId !== documentId) return;
      const { toast } = await import('sonner');
      if (!aiEditEnabledRef.current) {
        toast.info(
          'KI-Bearbeitung ist deaktiviert — es wurde nichts an der Präsentation geändert.'
        );
        return;
      }
      const doc = ydocRef.current;
      if (!doc) {
        toast.error('Die Präsentation ist noch nicht geladen.');
        return;
      }
      try {
        const result = await getContractsClient().presentations.ai({
          params: { id: documentId },
          body: {
            userPrompt: payload.userPrompt,
            presentationContext: serializePresentationContext(
              readSlides(doc),
              titleRef.current?.trim() || ''
            ),
            ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
          },
        });
        if (result.status !== 200) {
          toast.error('Folien-Aktion fehlgeschlagen.');
          return;
        }
        if (result.body.operations.length === 0) {
          toast.info('Es wurde keine Folien-Änderung erkannt — nichts wurde geändert.');
          return;
        }
        const { applied, skipped } = applyPresentationOperations(doc, result.body.operations);
        if (applied > 0) {
          toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`);
        }
        if (skipped.length > 0) {
          toast.warning(skipped.join(' · '));
        }
      } catch (err) {
        toast.error(
          `Folien-Aktion fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
        );
      }
    });
  }, [documentId, registerDocumentEditHandler]);

  const surfaceStore = useMemo<ChatSurfaceStore>(
    () =>
      createChatSurfaceStore({
        selectedAgentId: 'gruenerator-presentations-editor',
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
        agentId: surface.selectedAgentId ?? 'gruenerator-presentations-editor',
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

  const value = useMemo<PresentationsChatState>(
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
    <PresentationsChatContext.Provider value={value}>
      <ChatSurfaceProvider store={surfaceStore}>
        <AssistantRuntimeProvider runtime={runtime}>
          <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>
        </AssistantRuntimeProvider>
      </ChatSurfaceProvider>
    </PresentationsChatContext.Provider>
  );
}
