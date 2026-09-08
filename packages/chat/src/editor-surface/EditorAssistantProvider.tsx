'use client';

/* eslint-disable react-hooks/refs --
   Uses the "latest ref" pattern: the live AI-edit toggle is mirrored into a ref
   (assigned during render) so the long-lived edit handler and getConfig read a
   fresh value without re-registering / rebuilding on every toggle. */
import {
  AssistantRuntimeProvider,
  AuiProvider,
  ExportedMessageRepository,
  Tools,
  useAui,
  useLocalRuntime,
  type AssistantRuntime,
} from '@assistant-ui/react';
import { ApiError } from '@gruenerator/shared/api';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { grueneratorToolkit } from '../components/tool-ui/GrueneratorToolUIs';
import { ChatCollaborationProvider } from '../context/ChatCollaborationContext';
import { ChatSurfaceProvider, createChatSurfaceStore } from '../context/ChatSurfaceContext';
import { useChatCollaboration } from '../hooks/useChatCollaboration';
import { useInterruptSignal, useQueueInterruptGuard } from '../hooks/useQueueInterruptGuard';
import { GrueneratorAttachmentAdapter } from '../runtime/GrueneratorAttachmentAdapter';
import {
  createGrueneratorModelAdapter,
  type GrueneratorAdapterConfig,
} from '../runtime/GrueneratorModelAdapter';
import { MESSAGE_QUEUE_ENABLED } from '../runtime/messageQueueFlag';
import { convertToThreadMessageLike } from '../runtime/threadMessageConversion';
import { useFeedbackAdapter } from '../runtime/useFeedbackAdapter';
import { useChatConfigStore } from '../stores/chatConfigStore';

import { deriveGateState, shouldImportHistory } from './helpers';
import { usePeerMessageSync } from './usePeerMessageSync';

import type { EditorAssistantState, EditorSurfaceAdapter } from './types';

const NOOP = () => {};

const EditorAssistantContext = createContext<EditorAssistantState | null>(null);

/**
 * Reads the current editor-assistant state (guest / loading / error / ready).
 * Each surface's view (`*AssistantChat`) renders off this; must be used inside
 * an {@link EditorAssistantProvider}.
 */
export function useEditorAssistant(): EditorAssistantState {
  const value = useContext(EditorAssistantContext);
  if (!value) {
    throw new Error('useEditorAssistant must be used inside <EditorAssistantProvider>');
  }
  return value;
}

export interface EditorAssistantProviderProps {
  adapter: EditorSurfaceAdapter;
  userId: string | null;
  userName: string | null;
  /** Live AI-edit toggle (canvas passes a constant true). */
  aiEditEnabled: boolean;
  /** Toggle callback; omit for surfaces with no toggle (canvas). */
  toggleAiEdit?: () => void;
  children: ReactNode;
}

/**
 * Shared host for every embedded editor chat sidebar. Replaces the five
 * near-identical `*ChatProvider` implementations; the only per-surface parts
 * live in {@link EditorSurfaceAdapter}.
 */
export function EditorAssistantProvider(props: EditorAssistantProviderProps) {
  if (!props.userId) {
    return (
      <EditorAssistantContext.Provider value={{ status: 'guest' }}>
        {props.children}
      </EditorAssistantContext.Provider>
    );
  }
  return (
    <EditorAuiReset>
      <EditorAssistantBootstrap {...props} userId={props.userId} />
    </EditorAuiReset>
  );
}

// Fresh AUI scope so an embedded editor chat never shares runtime state with a
// chat surface higher in the tree. Still registers the shared tool toolkit so
// tool-call parts (search steps, edit_document) render the SAME cards as /chat —
// isolating the scope must NOT drop the tool-render registration.
function EditorAuiReset({ children }: { children: ReactNode }) {
  return (
    <AuiProvider value={null}>
      <EditorToolScope>{children}</EditorToolScope>
    </AuiProvider>
  );
}

// Registers the toolkit onto the isolated root above — `useAui` extends the
// nearest provider, so this must sit INSIDE the `value={null}` boundary.
function EditorToolScope({ children }: { children: ReactNode }) {
  const freshAui = useAui({ tools: Tools({ toolkit: grueneratorToolkit }) });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

type BootstrapProps = Omit<EditorAssistantProviderProps, 'userId'> & { userId: string };

function EditorAssistantBootstrap({ adapter, children, ...rest }: BootstrapProps) {
  const {
    data: threadId,
    error,
    isLoading,
  } = useQuery({
    queryKey: adapter.threadQueryKey,
    queryFn: adapter.resolveThreadId,
    staleTime: 5 * 60_000,
  });

  const gate = deriveGateState({ error, isLoading, threadId });

  if (gate.status === 'error') {
    return (
      <EditorAssistantContext.Provider value={gate}>{children}</EditorAssistantContext.Provider>
    );
  }
  if (gate.status === 'loading' || !threadId) {
    return (
      <EditorAssistantContext.Provider value={{ status: 'loading' }}>
        {children}
      </EditorAssistantContext.Provider>
    );
  }

  return (
    <EditorAssistantReadyHost key={threadId} adapter={adapter} threadId={threadId} {...rest}>
      {children}
    </EditorAssistantReadyHost>
  );
}

type ReadyHostProps = Omit<BootstrapProps, 'userId'> & { userId: string; threadId: string };

function EditorAssistantReadyHost({
  adapter,
  threadId,
  userId,
  userName,
  aiEditEnabled,
  toggleAiEdit,
  children,
}: ReadyHostProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const registerContextProvider = useChatConfigStore((s) => s.registerContextProvider);

  const aiEditEnabledRef = useRef(aiEditEnabled);
  aiEditEnabledRef.current = aiEditEnabled;

  const { data: initialMessages } = useQuery({
    queryKey: ['chat-thread-messages', threadId],
    queryFn: async () => {
      const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
      // Throw instead of returning []: an empty array is cached as a valid
      // result, so a 500 rendered the editor sidebar as an empty chat for
      // 30 seconds. A throw gives TanStack its retry and an error state.
      if (!res.ok) throw new ApiError(res.status, 'Nachrichten konnten nicht geladen werden');
      const parsed = loadedThreadMessagesSchema.parse(await res.json());
      return convertToThreadMessageLike(parsed as Parameters<typeof convertToThreadMessageLike>[0]);
    },
    staleTime: 30_000,
  });

  // Per-thread context provider: feeds the surface's live currentDocument /
  // currentBoard into every request. Lives for the thread's lifetime.
  useEffect(() => {
    return registerContextProvider(threadId, adapter.getRequestContext);
  }, [threadId, adapter, registerContextProvider]);

  // Surface's live-edit handler (documentEditHandlers / boardActionHandlers).
  useEffect(() => {
    return adapter.registerEditHandler({
      threadId,
      getAiEditEnabled: () => aiEditEnabledRef.current,
    });
  }, [threadId, adapter]);

  // Per-surface scoped store — selections don't bleed into the global /chat surface.
  const surfaceStore = useMemo(
    () =>
      createChatSurfaceStore({
        selectedAgentId: adapter.agentId,
        threadMode: 'chat',
        searchMode: 'web',
      }),
    [adapter.agentId]
  );

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const getConfig = useMemo<() => GrueneratorAdapterConfig>(
    () => () => {
      const surface = surfaceStore.getState();
      // `auto` goes through untouched — the server resolves it after the
      // classifier, so an edit turn lands on the tool lane and a question about
      // the open document does not. See apps/api/.../agents/autoPolicy.ts.
      const tools = adapter.getTools(aiEditEnabledRef.current);
      return {
        agentId: surface.selectedAgentId ?? adapter.agentId,
        modelId: surface.selectedModel,
        enabledTools: tools.enabledTools,
        customEnabledTools: tools.customEnabledTools,
        threadId: threadIdRef.current,
        threadMode: surface.threadMode,
        searchMode: surface.searchMode,
        selectedNotebookId: surface.selectedNotebookId,
        customSystemPrompt: surface.customSystemPrompt,
        customRoleName: surface.customRoleName,
        // Sticky connector is a main-chat feature; editor surfaces never pin.
        pinnedConnector: null,
      };
    },
    [surfaceStore, adapter]
  );

  // Pinned binding: one thread per mount, resolved by the surface — the aui
  // runtime's per-run thread id is never consulted (see ThreadBinding).
  const interruptSignal = useInterruptSignal();
  const modelAdapter = useMemo(
    () =>
      createGrueneratorModelAdapter(
        getConfig,
        { onInterrupt: interruptSignal.notify },
        { threadBinding: 'pinned' }
      ),
    [getConfig, interruptSignal]
  );
  const attachmentAdapter = useMemo(
    () => (adapter.attachments === false ? null : new GrueneratorAttachmentAdapter()),
    [adapter.attachments]
  );

  // The queue is paired with the adapter-side interrupt signal, not with the
  // message status: this runtime declares no `unstable_humanToolNames`, so a
  // clarification never parks the message at `requires-action` here, while the
  // shared adapter still arms `interruptedThreadId` and aborts every further run
  // on the thread. Reading the status would have looked like cover and been
  // none — see useQueueInterruptGuard (#3020).
  const feedbackAdapter = useFeedbackAdapter();
  const runtime = useLocalRuntime(modelAdapter, {
    initialMessages: initialMessages ?? [],
    unstable_enableMessageQueue: MESSAGE_QUEUE_ENABLED,
    adapters: {
      feedback: feedbackAdapter,
      ...(attachmentAdapter ? { attachments: attachmentAdapter } : {}),
    },
  });
  useQueueInterruptGuard(runtime, interruptSignal);

  const importedRef = useRef(false);
  useEffect(() => {
    if (
      !shouldImportHistory({
        alreadyImported: importedRef.current,
        messageCount: initialMessages?.length ?? 0,
        isRunning: runtime.thread.getState().isRunning,
      })
    ) {
      return;
    }
    runtime.thread.import(ExportedMessageRepository.fromArray(initialMessages ?? []));
    importedRef.current = true;
  }, [initialMessages, runtime]);

  const value = useMemo<EditorAssistantState>(
    () => ({
      status: 'ready',
      threadId,
      runtime,
      targetId: adapter.targetId,
      userName,
      aiEditEnabled,
      toggleAiEdit: toggleAiEdit ?? NOOP,
    }),
    [threadId, runtime, adapter.targetId, userName, aiEditEnabled, toggleAiEdit]
  );

  return (
    <EditorAssistantContext.Provider value={value}>
      <ChatSurfaceProvider store={surfaceStore}>
        <AssistantRuntimeProvider runtime={runtime}>
          <EditorCollabWrap
            enabled={adapter.collaboration !== false}
            threadId={threadId}
            runtime={runtime}
            userId={userId}
            userName={userName}
          >
            {children}
          </EditorCollabWrap>
        </AssistantRuntimeProvider>
      </ChatSurfaceProvider>
    </EditorAssistantContext.Provider>
  );
}

interface CollabWrapProps {
  enabled: boolean;
  threadId: string;
  runtime: AssistantRuntime;
  userId: string;
  userName: string | null;
  children: ReactNode;
}

// `enabled` is fixed per surface (stable across a mounted tree), so the branch
// never flips at runtime and the hook order inside EditorCollabBridge is stable.
function EditorCollabWrap({ enabled, children, ...rest }: CollabWrapProps) {
  if (!enabled) return <>{children}</>;
  return <EditorCollabBridge {...rest}>{children}</EditorCollabBridge>;
}

function EditorCollabBridge({
  threadId,
  runtime,
  userId,
  userName,
  children,
}: Omit<CollabWrapProps, 'enabled'>) {
  const collabUser = useMemo(() => ({ id: userId, name: userName ?? userId }), [userId, userName]);
  const collab = useChatCollaboration(threadId, collabUser);
  usePeerMessageSync({ threadId, runtime, collab });
  return <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>;
}
