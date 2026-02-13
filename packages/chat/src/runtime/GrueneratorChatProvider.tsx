'use client';

import { type ReactNode, useMemo, useCallback, type PropsWithChildren } from 'react';
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
import { chatApiClient } from '../context/ChatContext';
import { useAgentStore } from '../stores/chatStore';
import { getDefaultAgent } from '../lib/agents';
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
  const { loadCompactionState } = useAgentStore();

  const history = useMemo(
    () => ({
      async load() {
        const { remoteId } = await aui.threadListItem().initialize();

        if (remoteId) {
          useAgentStore.getState().setCurrentThread(remoteId);

          try {
            const msgs = await chatApiClient.get<LoadedMessage[]>(
              `/api/chat-service/messages?threadId=${remoteId}`
            );
            const converted = convertToThreadMessageLike(msgs);
            loadCompactionState(remoteId, chatApiClient);
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
    [aui, loadCompactionState]
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
    incrementMessageCount,
    needsCompaction,
    compactionState,
    triggerCompaction,
  } = useAgentStore();

  const getConfig = useCallback(
    (): GrueneratorAdapterConfig => ({
      agentId: selectedAgentId,
      modelId: selectedModel,
      enabledTools,
      threadId: useAgentStore.getState().currentThreadId,
    }),
    [selectedAgentId, selectedModel, enabledTools]
  );

  const onThreadCreated = useCallback((newThreadId: string) => {
    useAgentStore.getState().setCurrentThread(newThreadId);
  }, []);

  const onComplete = useCallback(
    (_metadata: StreamMetadata) => {
      const tid = useAgentStore.getState().currentThreadId;
      if (tid) {
        incrementMessageCount();
        incrementMessageCount();

        if (needsCompaction && !compactionState.summary) {
          triggerCompaction(tid, chatApiClient);
        }
      }
    },
    [incrementMessageCount, needsCompaction, compactionState.summary, triggerCompaction]
  );

  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, { onThreadCreated, onComplete }),
    [getConfig, onThreadCreated, onComplete]
  );

  return useLocalRuntime(modelAdapter);
}

export function GrueneratorChatProvider({ children, userId }: GrueneratorChatProviderProps) {
  const threadListAdapter = useMemo(() => {
    const base = createGrueneratorThreadListAdapter(chatApiClient, getDefaultAgent());
    return {
      ...base,
      unstable_Provider: GrueneratorHistoryProvider,
    } satisfies RemoteThreadListAdapter;
  }, []);

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
      {children}
    </AssistantRuntimeProvider>
  );
}
