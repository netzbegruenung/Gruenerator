import { AssistantProvider, type ThreadMessageLike } from '@assistant-ui/react-native';
import { useAgentStore } from '@gruenerator/chat';
import { type ReactNode, useEffect, useRef } from 'react';

import { useMobileChatRuntime } from '../hooks/useMobileChatRuntime';
import { configureMobileChat, getMobileChatApiClient } from '../services/chatConfig';

interface MobileChatProviderProps {
  children: ReactNode;
  threadId?: string | null;
  initialMessages?: readonly ThreadMessageLike[];
}

interface LoadedMessage {
  id: string;
  role: string;
  content: string;
  metadata?: {
    intent?: string;
    searchCount?: number;
    citations?: Array<{
      id: number;
      title: string;
      url: string;
      snippet?: string;
      domain?: string;
    }>;
    searchResults?: Array<{ title: string; url: string; snippet?: string }>;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
    }>;
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

function ThreadSetup({ threadId }: { threadId?: string | null }) {
  const loadCompactionState = useAgentStore((s) => s.loadCompactionState);

  useEffect(() => {
    if (threadId && threadId !== 'new') {
      useAgentStore.getState().setCurrentThread(threadId);
      const apiClient = getMobileChatApiClient();
      loadCompactionState(threadId, apiClient);
    } else {
      useAgentStore.getState().setCurrentThread(null);
    }
  }, [threadId, loadCompactionState]);

  return null;
}

export function MobileChatProvider({
  children,
  threadId,
  initialMessages: _initialMessages,
}: MobileChatProviderProps) {
  const configuredRef = useRef<boolean>(null);
  if (configuredRef.current == null) {
    configureMobileChat();
    configuredRef.current = true;
  }

  const runtime = useMobileChatRuntime();

  return (
    <AssistantProvider runtime={runtime}>
      <ThreadSetup threadId={threadId} />
      {children}
    </AssistantProvider>
  );
}

export { convertToThreadMessageLike, type LoadedMessage };
