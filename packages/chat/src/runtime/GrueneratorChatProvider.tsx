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
import { setCustomAgents, type CustomAgentMentionable } from '../lib/mentionables';
import {
  createGrueneratorModelAdapter,
  type GrueneratorAdapterConfig,
} from './GrueneratorModelAdapter';
import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';
import { createGrueneratorThreadListAdapter } from './GrueneratorThreadListAdapter';
import { grueneratorToolkit } from '../components/tool-ui/GrueneratorToolUIs';
import type {
  GeneratedImage,
  Citation,
  SearchResult,
  StreamMetadata,
} from '../hooks/useChatGraphStream';

interface GrueneratorChatProviderProps {
  children: ReactNode;
  userId?: string;
  config?: ChatConfig;
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
  };
}

const INTENT_TO_TOOL: Record<string, string> = {
  search: 'gruenerator_search',
  web: 'web_search',
  research: 'research',
  examples: 'gruenerator_examples_search',
};

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
        const { remoteId } = await aui.threadListItem().initialize();

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
  const { selectedAgentId, selectedModel, enabledTools, useDeepAgent, selectedNotebookId } =
    useAgentStore(
      useShallow((s) => ({
        selectedAgentId: s.selectedAgentId,
        selectedModel: s.selectedModel,
        enabledTools: s.enabledTools,
        useDeepAgent: s.useDeepAgent,
        selectedNotebookId: s.selectedNotebookId,
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
    }),
    [selectedAgentId, selectedModel, enabledTools, useDeepAgent, selectedNotebookId]
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

  const onComplete = useCallback(
    (_metadata: StreamMetadata) => {
      const tid = useAgentStore.getState().currentThreadId;
      if (tid) {
        incrementMessageCount();
        incrementMessageCount();

        if (needsCompaction && !compactionState.summary) {
          triggerCompaction(tid, runtimeApiClient);
        }
      }
    },
    [
      incrementMessageCount,
      needsCompaction,
      compactionState.summary,
      triggerCompaction,
      runtimeApiClient,
    ]
  );

  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, { onThreadCreated, onComplete }),
    [getConfig, onThreadCreated, onComplete]
  );

  return useLocalRuntime(modelAdapter);
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
      const state = aui.threadListItem().getState();
      if (!state.title) {
        titleTriggeredRef.current = currentThreadId;
        console.log('[TitleGen] Triggering generateTitle via aui for', currentThreadId);
        try {
          aui.threadListItem().generateTitle();
        } catch (err: unknown) {
          console.warn('[TitleGen] aui.generateTitle() failed:', err);
        }
      }
    }
  }, [messageCount, currentThreadId, aui]);

  return null;
}

export function GrueneratorChatProvider({
  children,
  userId,
  config,
}: GrueneratorChatProviderProps) {
  useEffect(() => {
    useChatConfigStore.getState().configure(config);
  }, [config]);

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
  }, [providerApiClient]);

  const threadListAdapter = useMemo(() => {
    const base = createGrueneratorThreadListAdapter(providerApiClient, getDefaultAgent());
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
    suggestions: Suggestions([
      {
        title: 'Pressemitteilung',
        label: 'schreiben lassen',
        prompt: '@presse Schreibe eine Pressemitteilung zum Thema ',
      },
      {
        title: 'Rede verfassen',
        label: 'für eine Veranstaltung',
        prompt: '@rede Schreibe eine Rede zum Thema ',
      },
      {
        title: 'Antrag formulieren',
        label: 'für eine Ratssitzung',
        prompt: '@antrag Formuliere einen Antrag zum Thema ',
      },
      {
        title: 'Allgemeine Frage',
        label: 'zum grünen Programm',
        prompt: 'Was ist die Position der Grünen zu ',
      },
    ]),
  });

  return (
    <AssistantRuntimeProvider aui={aui} runtime={runtime}>
      <ThreadTitleEffect />
      {children}
    </AssistantRuntimeProvider>
  );
}
