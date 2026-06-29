'use client';

/* eslint-disable react-hooks/refs --
   Uses the "latest ref" pattern: live Yjs/board state is mirrored into refs (assigned
   during render) so the long-lived chat context provider and board action handler read
   fresh values without re-registering on every board update. */
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
} from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { usePeerMessageSync } from '../docs/usePeerMessageSync';

import { applyBoardOperations, type BoardMutations } from './applyBoardOperations';
import { useBoardAiEditEnabled } from './BoardAiEditToggle';
import { useAssignableMembers } from './hooks/useAssignableMembers';
import { serializeBoardForChat } from './utils/serializeBoardContext';

type ChatCollabValue = ReturnType<typeof useChatCollaboration>;

export type BoardChatState =
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
      boardId: string;
      userName: string | null;
    };

const BoardChatContext = createContext<BoardChatState | null>(null);

export function useBoardChat(): BoardChatState {
  const value = useContext(BoardChatContext);
  if (!value) {
    throw new Error('useBoardChat must be used inside <BoardAssistantProvider>');
  }
  return value;
}

interface BoardAssistantProviderProps {
  boardId: string;
  userId: string | null;
  userName: string | null;
  boardTitle: string | null;
  boardState: BoardMutations;
  /** Active view's grouping field — column/status ops target this field. */
  groupByFieldId?: string;
  children: ReactNode;
}

export function BoardAssistantProvider({
  boardId,
  userId,
  userName,
  boardTitle,
  boardState,
  groupByFieldId,
  children,
}: BoardAssistantProviderProps) {
  if (!userId) {
    return (
      <BoardChatContext.Provider value={{ status: 'guest' }}>{children}</BoardChatContext.Provider>
    );
  }
  return (
    <BoardAuiReset>
      <BoardAssistantProviderInner
        boardId={boardId}
        userId={userId}
        userName={userName}
        boardTitle={boardTitle}
        boardState={boardState}
        groupByFieldId={groupByFieldId}
      >
        {children}
      </BoardAssistantProviderInner>
    </BoardAuiReset>
  );
}

function BoardAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

interface InnerProps {
  boardId: string;
  userId: string;
  userName: string | null;
  boardTitle: string | null;
  boardState: BoardMutations;
  /** Active view's grouping field — column/status ops target this field. */
  groupByFieldId?: string;
  children: ReactNode;
}

function BoardAssistantProviderInner({
  boardId,
  userId,
  userName,
  boardTitle,
  boardState,
  groupByFieldId,
  children,
}: InnerProps) {
  const {
    data: threadResp,
    error: threadError,
    isLoading: threadLoading,
  } = useQuery<ChatThreadResponse>({
    queryKey: ['boards', boardId, 'chat-thread'],
    queryFn: async () => {
      const result = await getContractsClient().boards.getChatThread({ params: { id: boardId } });
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
      <BoardChatContext.Provider
        value={{
          status: 'error',
          error: threadError instanceof Error ? threadError : new Error(String(threadError)),
        }}
      >
        {children}
      </BoardChatContext.Provider>
    );
  }

  if (threadLoading || !threadId) {
    return (
      <BoardChatContext.Provider value={{ status: 'loading' }}>
        {children}
      </BoardChatContext.Provider>
    );
  }

  return (
    <BoardChatReadyHost
      key={threadId}
      threadId={threadId}
      boardId={boardId}
      userId={userId}
      userName={userName}
      boardTitle={boardTitle}
      boardState={boardState}
      groupByFieldId={groupByFieldId}
    >
      {children}
    </BoardChatReadyHost>
  );
}

interface ReadyHostProps {
  threadId: string;
  boardId: string;
  userId: string;
  userName: string | null;
  boardTitle: string | null;
  boardState: BoardMutations;
  /** Active view's grouping field — column/status ops target this field. */
  groupByFieldId?: string;
  children: ReactNode;
}

function BoardChatReadyHost({
  threadId,
  boardId,
  userId,
  userName,
  boardTitle,
  boardState,
  groupByFieldId,
  children,
}: ReadyHostProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);
  const registerBoardActionHandler = useChatConfigStore((s) => s.registerBoardActionHandler);
  const queryClient = useQueryClient();

  const { enabled: aiEditEnabled, toggle: toggleAiEdit } = useBoardAiEditEnabled(boardId);
  const aiEditEnabledRef = useRef(aiEditEnabled);
  aiEditEnabledRef.current = aiEditEnabled;

  const { data: assignableMembers } = useAssignableMembers(boardId);

  // Refs so the long-lived context provider + action handler always read fresh
  // live state without re-registering on every Yjs update.
  const boardStateRef = useRef(boardState);
  boardStateRef.current = boardState;
  const boardTitleRef = useRef(boardTitle);
  boardTitleRef.current = boardTitle;
  const groupByFieldIdRef = useRef(groupByFieldId);
  groupByFieldIdRef.current = groupByFieldId;
  const membersRef = useRef(assignableMembers ?? []);
  membersRef.current = assignableMembers ?? [];

  // Promise-based delete confirmation rendered as an AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    titles: string[];
    resolve: (ok: boolean) => void;
  } | null>(null);
  const confirmDelete = useCallback((titles: string[]): Promise<boolean> => {
    return new Promise<boolean>((resolve) => setPendingDelete({ titles, resolve }));
  }, []);
  const resolvePendingDelete = useCallback((ok: boolean) => {
    setPendingDelete((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

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

  // Per-thread context provider: feed the live board state each request.
  useEffect(() => {
    const provider = (): ChatRequestContext => ({
      currentBoard: serializeBoardForChat({
        boardId,
        boardTitle: boardTitleRef.current,
        fields: boardStateRef.current.fields,
        rows: boardStateRef.current.rows,
        views: boardStateRef.current.views,
        assignableMembers: membersRef.current,
        ...(groupByFieldIdRef.current ? { groupByFieldId: groupByFieldIdRef.current } : {}),
      }),
    });
    return registerContextProvider(threadId, provider);
  }, [threadId, boardId, registerContextProvider]);

  // Board-action handler: plan operations via /api/boards/:id/ai, then apply
  // them to the live board with a client-side executor.
  useEffect(() => {
    return registerBoardActionHandler(boardId, async (payload) => {
      if (payload.targetBoardId !== boardId) return;
      // The toggle may have been switched off after the request was sent (the
      // classifier read enabledTools at send time). Don't apply, but tell the
      // user so the chat's success-sounding reply isn't mistaken for a real edit.
      if (!aiEditEnabledRef.current) {
        toast.info('KI-Bearbeitung ist deaktiviert — es wurde nichts am Board geändert.');
        return;
      }
      try {
        const result = await getContractsClient().boards.ai({
          params: { id: boardId },
          body: {
            userPrompt: payload.userPrompt,
            board: serializeBoardForChat({
              boardId,
              boardTitle: boardTitleRef.current,
              fields: boardStateRef.current.fields,
              rows: boardStateRef.current.rows,
              views: boardStateRef.current.views,
              assignableMembers: membersRef.current,
            }),
            ...(payload.referenceContent ? { referenceContent: payload.referenceContent } : {}),
          },
        });
        if (result.status !== 200) {
          toast.error('Board-Aktion fehlgeschlagen.');
          return;
        }
        if (result.body.operations.length === 0) {
          // The planner returned no operations — the chat reply may still sound
          // like a success, so surface that nothing was applied instead of
          // returning silently.
          toast.info('Es wurde keine Board-Änderung erkannt — nichts wurde geändert.');
          return;
        }
        const { applied, skipped } = await applyBoardOperations(result.body.operations, {
          boardState: boardStateRef.current,
          currentUserId: userId,
          assignableMembers: membersRef.current,
          ...(groupByFieldIdRef.current ? { groupByFieldId: groupByFieldIdRef.current } : {}),
          addComment: async (taskId, text) => {
            const res = await getContractsClient().boardComments.createComment({
              params: { boardId, cardId: taskId },
              body: { blocks: [{ type: 'text', text }] },
            });
            if (res.status !== 201) throw new Error(`Kommentar fehlgeschlagen (${res.status})`);
            void queryClient.invalidateQueries({ queryKey: ['board-comments', boardId, taskId] });
          },
          confirmDelete,
        });
        if (applied > 0) {
          toast.success(`${applied} Änderung${applied === 1 ? '' : 'en'} übernommen.`);
        }
        if (skipped.length > 0) {
          toast.warning(skipped.join(' · '));
        }
      } catch (err) {
        toast.error(
          `Board-Aktion fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
        );
      }
    });
  }, [boardId, userId, registerBoardActionHandler, confirmDelete, queryClient]);

  const surfaceStore = useMemo<ChatSurfaceStore>(
    () =>
      createChatSurfaceStore({
        selectedAgentId: 'gruenerator-boards-editor',
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
        agentId: surface.selectedAgentId ?? 'gruenerator-boards-editor',
        modelId: resolvedModelId,
        enabledTools: {
          search: true,
          web: true,
          examples: true,
          pressemitteilung_examples: false,
          research: true,
        },
        customEnabledTools: {
          summary: true,
          edit_current_board: aiEditEnabledRef.current,
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

  const value = useMemo<BoardChatState>(
    () => ({
      status: 'ready',
      threadId,
      runtime,
      collab,
      aiEditEnabled,
      toggleAiEdit,
      boardId,
      userName,
    }),
    [threadId, runtime, collab, aiEditEnabled, toggleAiEdit, boardId, userName]
  );

  return (
    <BoardChatContext.Provider value={value}>
      <ChatSurfaceProvider store={surfaceStore}>
        <AssistantRuntimeProvider runtime={runtime}>
          <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>
        </AssistantRuntimeProvider>
      </ChatSurfaceProvider>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) resolvePendingDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete && pendingDelete.titles.length === 1
                ? 'Aufgabe löschen?'
                : `${pendingDelete?.titles.length ?? 0} Aufgaben löschen?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.titles.length <= 5
                ? pendingDelete.titles.map((t) => `„${t}"`).join(', ')
                : 'Diese Aktion kann nicht rückgängig gemacht werden.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolvePendingDelete(false)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolvePendingDelete(true)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BoardChatContext.Provider>
  );
}
