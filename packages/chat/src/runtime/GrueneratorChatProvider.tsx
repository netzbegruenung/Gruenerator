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
  unstable_useRemoteThreadListRuntime as useRemoteThreadListRuntime,
  type unstable_RemoteThreadListAdapter as RemoteThreadListAdapter,
  type ThreadMessageLike,
  RuntimeAdapterProvider,
  ExportedMessageRepository,
} from '@assistant-ui/react';
import { createChatApiClient } from '../context/ChatContext';
import { useAgentStore } from '../stores/chatStore';
import { useChatConfigStore, type ChatConfig } from '../stores/chatConfigStore';
import { getDefaultAgent } from '../lib/agents';
import {
  setCustomAgents,
  setBoardMentionables,
  setDocMentionables,
  type CustomAgentMentionable,
} from '../lib/mentionables';
import { useChatCollaboration } from '../hooks/useChatCollaboration';
import { ChatCollaborationProvider } from '../context/ChatCollaborationContext';
import { VoxtralDictationAdapter } from '@gruenerator/voice';
import {
  createGrueneratorModelAdapter,
  type GrueneratorAdapterConfig,
} from './GrueneratorModelAdapter';
import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';
import {
  createGrueneratorThreadListAdapter,
  type ExternalThreadEntry,
} from './GrueneratorThreadListAdapter';
import { ExternalThreadProvider } from '../context/ExternalThreadContext';
import { grueneratorToolkit } from '../components/tool-ui/GrueneratorToolUIs';
import { chatSuggestions } from '../lib/suggestions';
import type {
  GeneratedImage,
  Citation,
  SearchResult,
  StreamMetadata,
} from '../hooks/useChatGraphStream';

interface GrueneratorChatProviderProps {
  children: ReactNode;
  userId?: string;
  userName?: string;
  config?: ChatConfig;
  getExternalThreads?: () => ExternalThreadEntry[];
  onExternalThreadClick?: (externalId: string) => void;
  activePath?: string;
}

interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

interface LoadedMessage {
  id: string;
  role: string;
  content: string;
  metadata?: {
    intent?: string;
    searchCount?: number;
    citations?: Citation[];
    searchResults?: SearchResult[];
    generatedImage?: GeneratedImage;
    toolCalls?: PersistedToolCall[];
    senderId?: string;
    senderName?: string | null;
  };
}

import { INTENT_TO_TOOL } from '../lib/toolMappings';

function extractContent(content: unknown): string {
  if (typeof content !== 'string') return '';

  if (content.startsWith('[{') && content.includes('"type":"text"')) {
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        return parts
          .filter(
            (p: unknown): p is { type: string; text: string } =>
              p !== null && typeof p === 'object' && 'type' in p && p.type === 'text' && 'text' in p
          )
          .map((p) => p.text)
          .join('');
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return content;
}

function convertToThreadMessageLike(messages: LoadedMessage[]): ThreadMessageLike[] {
  return messages.map((m) => {
    const textContent = extractContent(m.content);

    type ToolCallLike = {
      readonly type: 'tool-call';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: Record<string, string>;
      readonly result?: unknown;
    };

    const contentParts: Array<{ type: 'text'; text: string } | ToolCallLike> = [];

    if (m.metadata?.toolCalls) {
      for (const tc of m.metadata.toolCalls) {
        contentParts.push({
          type: 'tool-call' as const,
          toolCallId: tc.toolCallId || `tc_${m.id}`,
          toolName: tc.toolName,
          args: { query: String((tc.args as Record<string, unknown>)?.query ?? '') },
          result: tc.result,
        });
      }
    } else if (m.role === 'assistant' && m.metadata?.intent && m.metadata.searchResults?.length) {
      const toolName = INTENT_TO_TOOL[m.metadata.intent];
      if (toolName) {
        contentParts.push({
          type: 'tool-call' as const,
          toolCallId: `tc_legacy_${m.id}`,
          toolName,
          args: { query: '' },
          result: { results: m.metadata.searchResults },
        });
      }
    }

    contentParts.push({ type: 'text' as const, text: textContent });

    const custom: Record<string, unknown> = {};
    if (m.metadata?.senderId) {
      custom.senderId = m.metadata.senderId;
      custom.senderName = m.metadata.senderName ?? null;
    }
    if (m.metadata?.citations) custom.citations = m.metadata.citations;
    if (m.metadata?.generatedImage) custom.generatedImage = m.metadata.generatedImage;
    if (m.metadata?.intent)
      custom.streamMetadata = {
        intent: m.metadata.intent,
        searchCount: m.metadata.searchCount ?? 0,
      };

    return {
      role: m.role as 'user' | 'assistant',
      content: contentParts,
      id: m.id,
      metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
    };
  });
}

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
            const converted = convertToThreadMessageLike(msgs);
            loadCompactionState(remoteId, apiClient);
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
    useDeepAgent,
    selectedNotebookId,
    threadMode,
    searchMode,
  } = useAgentStore(
    useShallow((s) => ({
      selectedAgentId: s.selectedAgentId,
      selectedModel: s.selectedModel,
      enabledTools: s.enabledTools,
      useDeepAgent: s.useDeepAgent,
      selectedNotebookId: s.selectedNotebookId,
      threadMode: s.threadMode,
      searchMode: s.searchMode,
    }))
  );
  const incrementMessageCount = useAgentStore((s) => s.incrementMessageCount);
  const needsCompaction = useAgentStore((s) => s.needsCompaction);
  const compactionState = useAgentStore((s) => s.compactionState);
  const triggerCompaction = useAgentStore((s) => s.triggerCompaction);

  const getConfig = useCallback(
    (): GrueneratorAdapterConfig => ({
      agentId: selectedAgentId,
      modelId: selectedModel,
      enabledTools,
      threadId: useAgentStore.getState().currentThreadId,
      useDeepAgent,
      selectedNotebookId,
      threadMode,
      searchMode,
    }),
    [
      selectedAgentId,
      selectedModel,
      enabledTools,
      useDeepAgent,
      selectedNotebookId,
      threadMode,
      searchMode,
    ]
  );

  const onThreadCreated = useCallback((newThreadId: string) => {
    useAgentStore.getState().setCurrentThread(newThreadId);
  }, []);

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const runtimeApiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

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

  const dictationAdapter = useMemo(() => new VoxtralDictationAdapter(), []);

  return useLocalRuntime(modelAdapter, {
    unstable_humanToolNames: ['ask_human'],
    adapters: { dictation: dictationAdapter },
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
    titleTriggeredRef.current = null;
  }, [currentThreadId]);

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

export function GrueneratorChatProvider({
  children,
  userId,
  userName,
  config,
  getExternalThreads,
  onExternalThreadClick,
  activePath,
}: GrueneratorChatProviderProps) {
  // Sync config store during render (before any hooks read from it).
  // useEffect runs AFTER render, which creates a race: providerApiClient
  // would capture the default onUnauthorized before configure() updates it.
  const prevConfigRef = useRef<ChatConfig | undefined>(undefined);
  if (config !== prevConfigRef.current) {
    prevConfigRef.current = config;
    useChatConfigStore.getState().configure(config);
  }

  // Safety net: suppress "Thread not found" unhandled rejections from @assistant-ui
  // internals (generateTitle, initialize, rename) that we can't intercept via onClick
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof Error && event.reason.message === 'Thread not found') {
        event.preventDefault();
        console.warn('[ThreadList] Suppressed unhandled "Thread not found" rejection');
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (!userId) {
    return <>{children}</>;
  }

  return (
    <GrueneratorChatRuntimeProvider
      userId={userId}
      userName={userName}
      getExternalThreads={getExternalThreads}
      onExternalThreadClick={onExternalThreadClick}
      activePath={activePath}
    >
      {children}
    </GrueneratorChatRuntimeProvider>
  );
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
  const user = useMemo(() => ({ id: userId, name: userName || userId }), [userId, userName]);
  const collab = useChatCollaboration(threadId, user);

  return <ChatCollaborationProvider value={collab}>{children}</ChatCollaborationProvider>;
}

function GrueneratorChatRuntimeProvider({
  children,
  userId,
  userName,
  getExternalThreads,
  onExternalThreadClick,
  activePath,
}: {
  children: ReactNode;
  userId: string;
  userName?: string;
  getExternalThreads?: () => ExternalThreadEntry[];
  onExternalThreadClick?: (externalId: string) => void;
  activePath?: string;
}) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const providerApiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  // Load user's custom prompts for @mention support
  useEffect(() => {
    const loadCustomAgents = async () => {
      try {
        const [ownPrompts, savedPrompts] = await Promise.all([
          providerApiClient.get<{ prompts?: CustomAgentMentionable[] }>('/auth/custom_prompts'),
          providerApiClient.get<{ prompts?: CustomAgentMentionable[] }>('/auth/saved_prompts'),
        ]);
        const own = ownPrompts?.prompts || [];
        const saved = savedPrompts?.prompts || [];
        const seenIds = new Set<string>();
        const merged: CustomAgentMentionable[] = [];
        for (const p of [...own, ...saved]) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            merged.push(p);
          }
        }
        setCustomAgents(merged);
      } catch {
        // Silently ignore — custom agents in @mention are optional
      }
    };
    loadCustomAgents();

    // Load user's boards for @board mention support
    const loadBoards = async () => {
      try {
        const boards =
          await providerApiClient.get<Array<{ id: string; title: string }>>('/api/boards');
        if (Array.isArray(boards)) {
          setBoardMentionables(
            boards.map((b) => ({
              id: b.id,
              title: b.title,
              slug: b.title
                .toLowerCase()
                .replace(/[äÄ]/g, 'ae')
                .replace(/[öÖ]/g, 'oe')
                .replace(/[üÜ]/g, 'ue')
                .replace(/ß/g, 'ss')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, ''),
            }))
          );
        }
      } catch {
        // Silently ignore — boards in @mention are optional
      }
    };
    loadBoards();

    // Load user's collaborative documents for @doc mention support
    const loadDocs = async () => {
      try {
        const docs =
          await providerApiClient.get<
            Array<{ id: string; title: string; document_subtype?: string }>
          >('/api/docs');
        if (Array.isArray(docs)) {
          setDocMentionables(
            docs
              .filter((d) => d.document_subtype !== 'boards')
              .map((d) => ({
                id: d.id,
                title: d.title,
                slug: d.title
                  .toLowerCase()
                  .replace(/[äÄ]/g, 'ae')
                  .replace(/[öÖ]/g, 'oe')
                  .replace(/[üÜ]/g, 'ue')
                  .replace(/ß/g, 'ss')
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, ''),
              }))
          );
        }
      } catch {
        // Silently ignore — docs in @mention are optional
      }
    };
    loadDocs();
  }, [providerApiClient, userId]);

  const getExternalThreadsRef = useRef(getExternalThreads);
  useEffect(() => {
    getExternalThreadsRef.current = getExternalThreads;
  });

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
        <ChatCollaborationBridge userId={userId} userName={userName}>
          {children}
        </ChatCollaborationBridge>
      </ExternalThreadProvider>
    </AssistantRuntimeProvider>
  );
}
