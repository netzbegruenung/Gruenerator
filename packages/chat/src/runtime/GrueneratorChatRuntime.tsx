'use client';

import {
  type ReactNode,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type PropsWithChildren,
} from 'react';
import { useShallow } from 'zustand/shallow';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAui,
  Tools,
  Suggestions,
  useRemoteThreadListRuntime,
  type RemoteThreadListAdapter,
  RuntimeAdapterProvider,
  ExportedMessageRepository,
} from '@assistant-ui/react';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { createChatApiClient } from '../context/ChatContext';
import { useAgentStore } from '../stores/chatStore';
import { AUTO_MODEL_ID, resolveAutoModel } from '../lib/resolveAutoModel';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { getDefaultAgent } from '../lib/agents';
import { useChatCollaboration } from '../hooks/useChatCollaboration';
import { ChatCollaborationProvider } from '../context/ChatCollaborationContext';
import { GrueneratorRealtimeVoiceAdapter, VoxtralDictationAdapter } from '@gruenerator/voice';
import { handleDictationError } from '../lib/dictationErrorHandler';
import {
  createGrueneratorModelAdapter,
  type GrueneratorAdapterConfig,
} from './GrueneratorModelAdapter';
import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';
import { AgentSwitchListener } from './AgentSwitchListener';
import {
  createGrueneratorThreadListAdapter,
  type ExternalThreadEntry,
} from './GrueneratorThreadListAdapter';
import { ExternalThreadProvider } from '../context/ExternalThreadContext';
import { grueneratorToolkit } from '../components/tool-ui/GrueneratorToolUIs';
import { ChatThreadListPortal } from '../components/ChatThreadListPortal';
import { chatSuggestions } from '../lib/suggestions';
import type { StreamMetadata } from '../hooks/useChatGraphStream';
import { convertToThreadMessageLike, type LoadedMessage } from './threadMessageConversion';

function GrueneratorHistoryProvider({ children }: PropsWithChildren) {
  const aui = useAui();
  const attachmentAdapter = useMemo(() => new GrueneratorAttachmentAdapter(), []);
  const loadCompactionState = useAgentStore((s) => s.loadCompactionState);
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
        let remoteId: string | undefined;
        try {
          const result = await aui.threadListItem().initialize();
          remoteId = result.remoteId;
        } catch (err) {
          console.warn('[History] Thread entry not available (likely deleted):', err);
          return { messages: [] };
        }

        if (remoteId) {
          useAgentStore.getState().setCurrentThread(remoteId);

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

            loadCompactionState(remoteId, apiClient);
            useAgentStore.getState().loadThreadSettings(remoteId, apiClient);
            return ExportedMessageRepository.fromArray(converted);
          } catch (error) {
            console.error('Error loading messages:', error);
            // Thread likely deleted — clear stale threadId to prevent FK violations on send
            useAgentStore.getState().setCurrentThread(null);
          }
        }

        return { messages: [] };
      },
      async append() {
        // Messages are persisted by the backend SSE stream handler
      },
    }),
    [aui, loadCompactionState, apiClient, endpoints.messages]
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
    customEnabledTools,
    activeSkillMention,
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
      customEnabledTools: s.customEnabledTools,
      activeSkillMention: s.activeSkillMention,
    }))
  );
  const incrementMessageCount = useAgentStore((s) => s.incrementMessageCount);
  const needsCompaction = useAgentStore((s) => s.needsCompaction);
  const compactionState = useAgentStore((s) => s.compactionState);
  const triggerCompaction = useAgentStore((s) => s.triggerCompaction);

  const getConfig = useCallback((): GrueneratorAdapterConfig => {
    const resolvedModelId =
      selectedModel === AUTO_MODEL_ID
        ? resolveAutoModel({
            threadMode,
            agent: selectedAgentId ? (getSystemAgent(selectedAgentId) ?? null) : null,
          })
        : selectedModel;
    return {
      agentId: selectedAgentId,
      modelId: resolvedModelId,
      enabledTools,
      threadId: useAgentStore.getState().currentThreadId,
      selectedNotebookId,
      threadMode,
      searchMode,
      customSystemPrompt,
      customRoleName,
      customEnabledTools,
      activeSkillMention,
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
    customEnabledTools,
    activeSkillMention,
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
    useAgentStore.getState().setCurrentThread(newThreadId);
    const state = useAgentStore.getState();
    if (state.threadMode === 'eigener' && state.customSystemPrompt) {
      state.saveThreadSettings(newThreadId, runtimeApiClientRef.current);
    }
  }, []);

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
          triggerCompaction(tid, runtimeApiClient);
        }
      }
    },
    [incrementMessageCount, triggerCompaction, runtimeApiClient]
  );

  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, { onThreadCreated, onComplete }),
    [getConfig, onThreadCreated, onComplete]
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

  return useLocalRuntime(modelAdapter, {
    unstable_humanToolNames: ['ask_human'],
    adapters: { dictation: dictationAdapter, voice: voiceAdapter },
  });
}

/**
 * Watches for first message completion and triggers title generation.
 * Assistant UI's built-in trigger never fires because initialize() pre-creates
 * the thread (status transitions to "regular" before the first message).
 * This effect bypasses that by calling generateTitle() directly via aui.
 */
function ThreadTitleEffect() {
  const aui = useAui();
  const messageCount = useAgentStore((s) => s.messageCount);
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const titleTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (messageCount >= 2 && currentThreadId && titleTriggeredRef.current !== currentThreadId) {
      try {
        const state = aui.threadListItem().getState();
        if (!state.title) {
          titleTriggeredRef.current = currentThreadId;
          aui.threadListItem().generateTitle();
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
  onRequestOpenChat,
}: {
  children: ReactNode;
  userId: string;
  userName?: string;
  getExternalThreads?: () => ExternalThreadEntry[];
  onExternalThreadClick?: (externalId: string) => void;
  activePath?: string;
  threadListPortalSlotId?: string;
  onRequestOpenChat?: () => void;
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

  const aui = useAui({
    tools: Tools({ toolkit: grueneratorToolkit }),
    suggestions: Suggestions(chatSuggestions),
  });

  const externalCtx = useMemo(
    () => (onExternalThreadClick ? { onClick: onExternalThreadClick, activePath } : null),
    [onExternalThreadClick, activePath]
  );

  return (
    <AssistantRuntimeProvider aui={aui} runtime={runtime}>
      <ExternalThreadProvider value={externalCtx}>
        <ThreadTitleEffect />
        <AgentSwitchListener />
        {threadListPortalSlotId && (
          <ChatThreadListPortal slotId={threadListPortalSlotId} onRequestOpen={onRequestOpenChat} />
        )}
        <ChatCollaborationBridge userId={userId} userName={userName}>
          {children}
        </ChatCollaborationBridge>
      </ExternalThreadProvider>
    </AssistantRuntimeProvider>
  );
}
