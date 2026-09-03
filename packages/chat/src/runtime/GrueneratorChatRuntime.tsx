'use client';

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAui,
  useAuiState,
  Tools,
  Suggestions,
  useRemoteThreadListRuntime,
  type RemoteThreadListAdapter,
  RuntimeAdapterProvider,
  ExportedMessageRepository,
  McpAppRenderer,
  McpAppsRemoteHost,
} from '@assistant-ui/react';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import { GrueneratorRealtimeVoiceAdapter, VoxtralDictationAdapter } from '@gruenerator/voice';
import {
  type ReactNode,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type PropsWithChildren,
} from 'react';
import { useShallow } from 'zustand/shallow';

import { ChatThreadListPortal } from '../components/ChatThreadListPortal';
import { grueneratorToolkit } from '../components/tool-ui/GrueneratorToolUIs';
import { ChatCollaborationProvider } from '../context/ChatCollaborationContext';
import { createChatApiClient } from '../context/ChatContext';
import { ChatNavigationProvider } from '../context/ChatNavigationContext';
import { ChatRuntimeReadyProvider } from '../context/ChatRuntimeReadyContext';
import { ExternalThreadProvider } from '../context/ExternalThreadContext';
import { useChatCollaboration } from '../hooks/useChatCollaboration';
import { useInterruptSignal, useQueueInterruptGuard } from '../hooks/useQueueInterruptGuard';
import { adoptRejection } from '../lib/adoptRejection';
import { getDefaultAgent } from '../lib/agents';
import { handleDictationError } from '../lib/dictationErrorHandler';
import { notifyError } from '../lib/notify';
import { chatSuggestions } from '../lib/suggestions';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import { ActiveRoleSyncEffect } from './ActiveRoleSyncEffect';
import { AgentSwitchListener } from './AgentSwitchListener';
import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';
import {
  createGrueneratorModelAdapter,
  type GrueneratorAdapterConfig,
} from './GrueneratorModelAdapter';
import {
  createGrueneratorThreadListAdapter,
  type ExternalThreadEntry,
} from './GrueneratorThreadListAdapter';
import { MESSAGE_QUEUE_ENABLED } from './messageQueueFlag';
import { ThreadDataSyncEffect } from './ThreadDataSyncEffect';
import { convertToThreadMessageLike, type LoadedMessage } from './threadMessageConversion';
import { useFeedbackAdapter } from './useFeedbackAdapter';

import type { StreamMetadata } from '../hooks/useChatGraphStream';

function GrueneratorHistoryProvider({ children }: PropsWithChildren) {
  const aui = useAui();
  const attachmentAdapter = useMemo(() => new GrueneratorAttachmentAdapter(), []);
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const apiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const history = useMemo(
    () => ({
      async load() {
        let remoteId: string | null;
        try {
          const itemState = aui.threadListItem.getState();
          remoteId = itemState.status === 'new' ? null : (itemState.remoteId ?? null);
        } catch (err) {
          console.warn('[History] Thread entry not available (likely deleted):', err);
          return { messages: [] };
        }

        if (!remoteId) {
          // Fresh draft: no server-side thread yet. assistant-ui's run-start
          // hook calls adapter.initialize() on the first message send, so an
          // abandoned draft never creates an empty "Neue Unterhaltung" row.
          // (currentThreadId is not touched here — see below.)
          const initialMsg = useAgentStore.getState().pendingInitialAssistantMessage;
          if (initialMsg) {
            useAgentStore.getState().setPendingInitialAssistantMessage(null);
            return ExportedMessageRepository.fromArray([
              {
                role: 'assistant' as const,
                content: [{ type: 'text' as const, text: initialMsg }],
                id: 'initial_draft',
              },
            ]);
          }
          return { messages: [] };
        }

        {
          // Deliberately does NOT write currentThreadId. MainThreadSyncEffect is
          // the single steady-state writer, driven by the thread that actually
          // won the switch. This call was the flicker: load() runs per thread
          // instance with no idea whether its thread is still wanted, so a slow
          // response from the thread the user just left landed after the runtime
          // had settled elsewhere — and the URL then followed the wrong one.
          try {
            const msgs = await apiClient.get<LoadedMessage[]>(
              `${endpoints.messages}?threadId=${remoteId}`
            );
            let converted = convertToThreadMessageLike(msgs);

            const initialMsg = useAgentStore.getState().pendingInitialAssistantMessage;
            if (converted.length === 0 && initialMsg) {
              converted = [
                {
                  role: 'assistant' as const,
                  content: [{ type: 'text' as const, text: initialMsg }],
                  id: `initial_${remoteId}`,
                },
              ];
              useAgentStore.getState().setPendingInitialAssistantMessage(null);
            }

            // Compaction state, thread settings and the interpreter's tabular
            // files are loaded by ThreadDataSyncEffect, which keys on the
            // settled main thread: load() runs once per runtime instance, so
            // doing it here skipped every revisit and had no way to tell that
            // its thread had lost a switch race.

            return ExportedMessageRepository.fromArray(converted);
          } catch (error) {
            console.error('Error loading messages:', error);
            if (isApiErrorWithStatus(error, 404)) {
              // Thread really is gone — clear the stale id to prevent FK
              // violations on the next send.
              useAgentStore.getState().setCurrentThread(null);
            } else {
              // A server hiccup or offline blip. Clearing the id here rendered
              // the thread empty AND made the next message fork a brand-new
              // thread, so the conversation looked lost. Keep the binding and
              // say what happened.
              notifyError(
                'Chatverlauf konnte nicht geladen werden',
                'Deine Unterhaltung ist nicht verloren — lade die Seite neu.'
              );
            }
          }
        }

        return { messages: [] };
      },
      async append() {
        // Messages are persisted by the backend SSE stream handler
      },
    }),
    [aui, apiClient, endpoints.messages]
  );

  const adapters = useMemo(
    () => ({
      history,
      attachments: attachmentAdapter,
    }),
    [history, attachmentAdapter]
  );

  return <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>;
}

function useGrueneratorThreadRuntime() {
  const {
    selectedAgentId,
    selectedModel,
    enabledTools,
    selectedNotebookId,
    threadMode,
    searchMode,
    customSystemPrompt,
    customRoleName,
    customRoleRef,
    customEnabledTools,
    activeSkillMention,
    pinnedConnector,
  } = useAgentStore(
    useShallow((s) => ({
      selectedAgentId: s.selectedAgentId,
      selectedModel: s.selectedModel,
      enabledTools: s.enabledTools,
      selectedNotebookId: s.selectedNotebookId,
      threadMode: s.threadMode,
      searchMode: s.searchMode,
      customSystemPrompt: s.customSystemPrompt,
      customRoleName: s.customRoleName,
      customRoleRef: s.customRoleRef,
      customEnabledTools: s.customEnabledTools,
      activeSkillMention: s.activeSkillMention,
      pinnedConnector: s.pinnedConnector,
    }))
  );
  const incrementMessageCount = useAgentStore((s) => s.incrementMessageCount);
  const needsCompaction = useAgentStore((s) => s.needsCompaction);
  const compactionState = useAgentStore((s) => s.compactionState);
  const triggerCompaction = useAgentStore((s) => s.triggerCompaction);

  const getConfig = useCallback((): GrueneratorAdapterConfig => {
    // `auto` is sent through as-is: the server resolves it AFTER the classifier
    // has run, so the choice can depend on the intent (and complexity) of the
    // turn — something we cannot know here, before the request goes out.
    // See apps/api/routes/chat/agents/autoPolicy.ts.
    return {
      agentId: selectedAgentId,
      modelId: selectedModel,
      enabledTools,
      threadId: useAgentStore.getState().currentThreadId,
      selectedNotebookId,
      threadMode,
      searchMode,
      customSystemPrompt,
      customRoleName,
      customRoleRef,
      customEnabledTools,
      activeSkillMention,
      pinnedConnector,
    };
  }, [
    selectedAgentId,
    selectedModel,
    enabledTools,
    selectedNotebookId,
    threadMode,
    searchMode,
    customSystemPrompt,
    customRoleName,
    customRoleRef,
    customEnabledTools,
    activeSkillMention,
    pinnedConnector,
  ]);

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const runtimeApiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const runtimeApiClientRef = useRef(runtimeApiClient);
  runtimeApiClientRef.current = runtimeApiClient;

  const onThreadCreated = useCallback((newThreadId: string) => {
    // Legacy-Tür der Thread-Erstellung: das Backend mintet nur, wenn der
    // Request keine gültige Thread-UUID trug (Sentinel-Leak, Reap-Recovery).
    // Den Normalfall — lazy `initialize()` im ThreadListAdapter — durchläuft
    // dieselbe Mint+Promotion-Sequenz dort.
    useAgentStore.getState().mintThreadFromDraft(newThreadId);
    useAgentStore.getState().promoteDraftRoleToThread(newThreadId, runtimeApiClientRef.current);
  }, []);

  // Rollenwechsel MITTEN im Thread: `onThreadCreated` feuert nur beim ersten
  // Turn, eine danach gewählte Rolle wäre sonst nie beim Server gelandet.
  //
  // Gebunden an `roleRefSource`, nicht an `customRoleRef`: den Wert setzt auch
  // `loadThreadSettings`, und ein Threadwechsel würde sonst genau das
  // zurückschreiben, was gerade geladen wurde — eine überflüssige Anfrage, im
  // Fehlerfall mit irreführendem Hinweis.
  const roleRefSource = useAgentStore((s) => s.roleRefSource);
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  useEffect(() => {
    if (roleRefSource !== 'user' || !currentThreadId) return;
    void useAgentStore.getState().saveThreadSettings(currentThreadId, runtimeApiClientRef.current);
    useAgentStore.setState({ roleRefSource: 'load' });
  }, [currentThreadId, roleRefSource]);

  const needsCompactionRef = useRef(needsCompaction);
  needsCompactionRef.current = needsCompaction;
  const compactionSummaryRef = useRef(compactionState.summary);
  compactionSummaryRef.current = compactionState.summary;

  const onComplete = useCallback(
    (_metadata: StreamMetadata) => {
      const tid = useAgentStore.getState().currentThreadId;
      if (tid) {
        incrementMessageCount();
        incrementMessageCount();

        if (needsCompactionRef.current && !compactionSummaryRef.current) {
          void triggerCompaction(tid, runtimeApiClient);
        }
      }
    },
    [incrementMessageCount, triggerCompaction, runtimeApiClient]
  );

  const interruptSignal = useInterruptSignal();
  const modelAdapter = useMemo(
    () =>
      createGrueneratorModelAdapter(getConfig, {
        onThreadCreated,
        onComplete,
        onInterrupt: interruptSignal.notify,
      }),
    [getConfig, onThreadCreated, onComplete, interruptSignal]
  );

  const dictationAdapter = useMemo(
    () => new VoxtralDictationAdapter({ onError: handleDictationError }),
    []
  );

  const voiceAdapter = useMemo(
    () =>
      new GrueneratorRealtimeVoiceAdapter({
        getThreadId: () => useAgentStore.getState().currentThreadId,
        getAgentId: () => useAgentStore.getState().selectedAgentId,
        onError: (reason, err) => console.error(`[RealtimeVoice] ${reason}:`, err),
      }),
    []
  );

  const feedbackAdapter = useFeedbackAdapter();

  const runtime = useLocalRuntime(modelAdapter, {
    unstable_humanToolNames: ['ask_human'],
    unstable_enableMessageQueue: MESSAGE_QUEUE_ENABLED,
    adapters: { dictation: dictationAdapter, voice: voiceAdapter, feedback: feedbackAdapter },
  });

  // Per thread, not around the thread list: this hook runs once per thread
  // runtime, so `modelAdapter`, `runtime` and the queue being emptied all belong
  // to the same thread. An interrupt on a thread the user has since left leaves
  // the visible thread's queue alone.
  useQueueInterruptGuard(runtime, interruptSignal);

  return runtime;
}

/**
 * Keeps the store's currentThreadId in lockstep with the active main thread.
 * history.load() only runs once per thread runtime instance, so switching
 * A → draft → back to A would leave a stale id — with lazy thread creation
 * a send in A would then hit the backend with threadId null and mint a wrong
 * new thread. Also nulls the persisted currentThreadId on boot (the initial
 * draft is main); the thread URL is the restore mechanism now.
 */
function MainThreadSyncEffect() {
  const mainRemoteId = useAuiState(
    (s) => s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.remoteId ?? null
  );

  useEffect(() => {
    useAgentStore.getState().setCurrentThread(mainRemoteId);
  }, [mainRemoteId]);

  return null;
}

/**
 * Watches for first message completion and triggers title generation.
 * With lazy initialize(), assistant-ui's built-in runEnd trigger fires for
 * new threads; this effect stays as the trigger for legacy pre-created
 * threads (status already "regular" before the first message). The adapter's
 * generateTitle dedupes so double invocation runs its side effects once.
 */
function ThreadTitleEffect() {
  const aui = useAui();
  const messageCount = useAgentStore((s) => s.messageCount);
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const titleTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (messageCount >= 2 && currentThreadId && titleTriggeredRef.current !== currentThreadId) {
      try {
        const state = aui.threadListItem.getState();
        // A "new" (not yet initialized) entry makes assistant-ui's
        // generateTitle() reject with `has status "new"` — the store's
        // currentThreadId can already point at a remote thread while the active
        // list item is still the local draft. Those threads are named by
        // assistant-ui's own runEnd trigger and, failing that, by the server on
        // turn persistence; this effect only covers legacy pre-created
        // ("regular") threads.
        if (!state.title && state.status !== 'new') {
          titleTriggeredRef.current = currentThreadId;
          // Async rejection: a try/catch around the call would not see it.
          adoptRejection(aui.threadListItem.generateTitle(), (err) => {
            console.warn('[TitleGen] generateTitle failed:', err);
          });
        }
      } catch (err: unknown) {
        console.warn('[TitleGen] Thread entry not available (likely deleted):', err);
      }
    }
  }, [messageCount, currentThreadId, aui]);

  return null;
}

function ChatCollaborationBridge({
  userId,
  userName,
  children,
}: {
  userId: string;
  userName?: string;
  children: ReactNode;
}) {
  const threadId = useAgentStore((s) => s.currentThreadId);
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const activeThreadId = chatViewMode === 'thread' ? threadId : null;
  const user = useMemo(() => ({ id: userId, name: userName || userId }), [userId, userName]);
  const collab = useChatCollaboration(activeThreadId, user);

  return <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>;
}

export function GrueneratorChatRuntimeProvider({
  children,
  userId,
  userName,
  getExternalThreads,
  onExternalThreadClick,
  activePath,
  threadListPortalSlotId,
  onNavigate,
}: {
  children: ReactNode;
  userId: string;
  userName?: string;
  getExternalThreads?: () => ExternalThreadEntry[];
  onExternalThreadClick?: (externalId: string) => void;
  activePath?: string;
  threadListPortalSlotId?: string;
  /** Host router. Lets the thread list open a thread by navigating to its URL. */
  onNavigate?: (path: string, opts?: { replace?: boolean }) => void;
}) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const providerApiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  // Dynamic @mention data (custom agents, boards, docs) is fetched via
  // useMentionablesQuery() inside GrueneratorComposer — keeps loading lazy
  // (only fires once a chat composer mounts) and removes manual cache
  // management.

  const getExternalThreadsRef = useRef(getExternalThreads);
  getExternalThreadsRef.current = getExternalThreads;

  const threadListAdapter = useMemo(() => {
    const base = createGrueneratorThreadListAdapter(providerApiClient, getDefaultAgent(), {
      onDelete: (remoteId) => {
        if (useAgentStore.getState().currentThreadId === remoteId) {
          useAgentStore.getState().setCurrentThread(null);
        }
      },
      getExternalThreads: () => getExternalThreadsRef.current?.() ?? [],
    });
    return {
      ...base,
      unstable_Provider: GrueneratorHistoryProvider,
    } satisfies RemoteThreadListAdapter;
  }, [providerApiClient]);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useGrueneratorThreadRuntime,
    adapter: threadListAdapter,
  });

  // MCP-Apps widget host (SYSTEM MCP tools only): renders any tool part carrying
  // a `ui://` mcp.app pointer as a sandboxed widget iframe, driven through the
  // /api/mcp-apps bridge with the credentialed fetch. Memoized so the widget
  // iframe isn't torn down on every re-render.
  const mcpAppsUrl = useChatConfigStore((s) => s.endpoints.mcpApps);
  const mcpApp = useMemo(() => {
    // The bridge host only ever posts to our string route URL; adapt the store's
    // (string-url) fetch to the standard fetch signature it expects.
    const bridgeFetch: typeof fetch = (input, init) =>
      fetchFn(typeof input === 'string' ? input : input.toString(), init);
    return McpAppRenderer({
      host: McpAppsRemoteHost({ url: mcpAppsUrl, fetch: bridgeFetch }),
      hostInfo: { name: 'gruenerator', version: '1.0.0' },
    });
  }, [mcpAppsUrl, fetchFn]);

  const aui = useAui({
    tools: Tools({ toolkit: grueneratorToolkit, mcpApp }),
    suggestions: Suggestions(chatSuggestions),
  });

  const externalCtx = useMemo(
    () => (onExternalThreadClick ? { onClick: onExternalThreadClick, activePath } : null),
    [onExternalThreadClick, activePath]
  );

  const navigationCtx = useMemo(
    () => (onNavigate ? { navigate: onNavigate, activePath } : null),
    [onNavigate, activePath]
  );

  return (
    <ChatRuntimeReadyProvider>
      <AssistantRuntimeProvider aui={aui} runtime={runtime}>
        <ChatNavigationProvider value={navigationCtx}>
          <ExternalThreadProvider value={externalCtx}>
            <MainThreadSyncEffect />
            {/* After MainThreadSyncEffect: it writes currentThreadId, which the
              per-thread loads below use as their "still current" guard. */}
            <ThreadDataSyncEffect />
            {/* After ThreadDataSyncEffect: the account-wide default role only
              applies to a draft, and the thread's own settings must have had
              their chance to land first. */}
            <ActiveRoleSyncEffect />
            <ThreadTitleEffect />
            <AgentSwitchListener />
            {threadListPortalSlotId && <ChatThreadListPortal slotId={threadListPortalSlotId} />}
            <ChatCollaborationBridge userId={userId} userName={userName}>
              {children}
            </ChatCollaborationBridge>
          </ExternalThreadProvider>
        </ChatNavigationProvider>
      </AssistantRuntimeProvider>
    </ChatRuntimeReadyProvider>
  );
}
