'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useAgentStore, PROVIDER_OPTIONS } from '@/lib/store';
import { agentsList } from '@/lib/agents';
import apiClient from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { Menu, Loader2, ArrowUp, Copy, Check, RotateCcw } from 'lucide-react';
import { MarkdownContent } from './markdown-content';
import { ToolCallUI } from '../mcp-tool-ui/tool-call-ui';
import { ModelSelector } from './model-selector';
import { ToolToggles } from './tool-toggles';

interface ChatMainProps {
  onMenuClick: () => void;
  userId?: string;
}

export function ChatMain({ onMenuClick, userId }: ChatMainProps) {
  const {
    selectedAgentId,
    selectedProvider,
    currentThreadId,
    setCurrentThread,
    addThread,
    updateThread,
    enabledTools,
    compactionState,
    needsCompaction,
    loadCompactionState,
    triggerCompaction,
    incrementMessageCount,
  } = useAgentStore();

  const currentProviderOption = PROVIDER_OPTIONS.find((p) => p.id === selectedProvider);

  const selectedAgent = agentsList.find((a) => a.identifier === selectedAgentId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  useEffect(() => {
    async function loadMessages() {
      if (!currentThreadId || !userId) {
        setInitialMessages([]);
        return;
      }

      setIsLoadingHistory(true);
      try {
        const messages = await apiClient.get<UIMessage[]>(
          `/api/chat-service/messages?threadId=${currentThreadId}`
        );
        // Debug: Log messages with toolInvocations
        const withTools = messages.filter((m: UIMessage & { toolInvocations?: unknown[] }) => m.toolInvocations?.length);
        if (withTools.length > 0) {
          console.log('[Chat] Loaded messages with tools:', withTools.map((m: UIMessage & { toolInvocations?: unknown[] }) => ({
            id: m.id,
            role: m.role,
            toolCount: m.toolInvocations?.length,
          })));
        }
        setInitialMessages(messages);
      } catch (error) {
        console.error('Error loading messages:', error);
        setInitialMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadMessages();
  }, [currentThreadId, userId]);

  // Load compaction state when thread changes
  useEffect(() => {
    if (currentThreadId && userId) {
      loadCompactionState(currentThreadId);
    }
  }, [currentThreadId, userId, loadCompactionState]);

  const apiBaseUrl = apiClient.getApiBaseUrl();

  // Debug fetch wrapper to log raw stream data
  const debugFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    console.log('[Chat Debug] Fetch request:', { url: input, method: init?.method });
    const response = await fetch(input, init);

    // Clone response to read body without consuming it
    const clonedResponse = response.clone();

    // Log first chunk of response body
    try {
      const reader = clonedResponse.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        if (value) {
          const text = new TextDecoder().decode(value);
          console.log('[Chat Debug] First chunk of response:', text.slice(0, 500));
        }
        reader.releaseLock();
      }
    } catch (e) {
      console.log('[Chat Debug] Could not read response body:', e);
    }

    return response;
  };

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    setMessages,
    reload,
    error,
  } = useChat({
    api: `${apiBaseUrl}/api/chat-graph/stream`,
    id: currentThreadId || undefined,
    initialMessages,
    credentials: 'include',
    fetch: debugFetch,
    streamProtocol: 'text',
    body: {
      agentId: selectedAgentId,
      provider: selectedProvider,
      model: currentProviderOption?.model,
      threadId: currentThreadId,
      enabledTools,
    },
    onResponse: (response) => {
      console.log('[Chat Debug] onResponse:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
      const newThreadId = response.headers.get('X-Thread-Id');
      if (newThreadId && !currentThreadId) {
        const newThread = {
          id: newThreadId,
          title: 'Neue Unterhaltung',
          agentId: selectedAgentId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        addThread(newThread);
        setCurrentThread(newThreadId);
      }
    },
    onError: (error) => {
      console.error('[Chat Debug] onError:', error);
      console.error('[Chat Debug] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    },
    onFinish: (message) => {
      console.log('[Chat Debug] onFinish:', {
        messageId: message.id,
        role: message.role,
        contentLength: message.content?.length || 0,
        hasToolInvocations: !!(message as any).toolInvocations?.length,
      });
      if (currentThreadId) {
        updateThread(currentThreadId, { updatedAt: new Date() });

        // Track message count for compaction
        incrementMessageCount();
        incrementMessageCount(); // +2 for user + assistant

        // Trigger compaction if threshold exceeded and no existing summary
        if (needsCompaction && !compactionState.summary) {
          console.log('[Chat] Message threshold exceeded, triggering compaction...');
          triggerCompaction(currentThreadId);
        }
      }
    },
  });

  // Log any error from useChat
  useEffect(() => {
    if (error) {
      console.error('[Chat Debug] useChat error state:', error);
    }
  }, [error]);

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  useEffect(() => {
    if (!currentThreadId) {
      setMessages([]);
      setInitialMessages([]);
    }
  }, [selectedAgentId, setMessages, currentThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleQuickQuestion = (question: string) => {
    handleInputChange({ target: { value: question } } as React.ChangeEvent<HTMLTextAreaElement>);
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;
      originalHandleSubmit(e);
    },
    [input, originalHandleSubmit]
  );

  const showWelcome = messages.length === 0 && !isLoadingHistory;

  return (
    <div className="flex h-full flex-col bg-background dark:bg-[#1a1a1a]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 hover:bg-primary/10 lg:hidden"
            aria-label="Menü öffnen"
          >
            <Menu className="h-5 w-5" />
          </button>
          <ModelSelector />
          <ToolToggles />
        </div>
        <div className="hidden items-center gap-2 text-sm text-foreground-muted lg:flex">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
            style={{ backgroundColor: selectedAgent?.backgroundColor || '#316049' }}
          >
            {selectedAgent?.avatar}
          </span>
          <span>{selectedAgent?.title}</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
        <div className="flex flex-grow flex-col gap-6 px-4 pt-8 pb-4">
          {isLoadingHistory ? (
            <div className="flex flex-grow items-center justify-center">
              <div className="flex items-center gap-2 text-foreground-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Lade Unterhaltung...</span>
              </div>
            </div>
          ) : showWelcome ? (
            <WelcomeScreen
              agent={selectedAgent}
              onQuickQuestion={handleQuickQuestion}
            />
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  agent={selectedAgent}
                  onRegenerate={message.role === 'assistant' ? () => reload() : undefined}
                />
              ))}
              {isLoading && (
                <div className="mx-auto flex w-full max-w-3xl items-start gap-4">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
                    style={{ backgroundColor: selectedAgent?.backgroundColor || '#316049' }}
                  >
                    {selectedAgent?.avatar}
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-foreground-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Schreibe...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl items-end rounded-3xl border border-border bg-background-secondary dark:bg-white/5"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder={`Nachricht an ${selectedAgent?.title || 'Assistent'}...`}
            rows={1}
            className="h-12 max-h-40 flex-grow resize-none bg-transparent p-3.5 pl-4 text-foreground outline-none placeholder:text-foreground-muted"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="m-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-30"
            aria-label="Nachricht senden"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-foreground-muted">
          Grünerator kann Fehler machen. Wichtige Infos bitte prüfen.
        </p>
      </div>
    </div>
  );
}

interface WelcomeScreenProps {
  agent: typeof agentsList[0] | undefined;
  onQuickQuestion: (question: string) => void;
}

function WelcomeScreen({ agent, onQuickQuestion }: WelcomeScreenProps) {
  const openingQuestions = agent?.openingQuestions || [];

  return (
    <div className="flex flex-grow flex-col items-center justify-center px-4">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-2xl"
        style={{ backgroundColor: agent?.backgroundColor || '#316049' }}
      >
        {agent?.avatar}
      </div>
      <h1 className="mt-4 text-xl font-medium text-foreground">
        {agent?.title || 'Grünerator Chat'}
      </h1>
      <p className="mt-1 text-sm text-foreground-muted">
        {agent?.description}
      </p>

      {openingQuestions.length > 0 && (
        <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          {openingQuestions.slice(0, 4).map((question, index) => (
            <button
              key={index}
              onClick={() => onQuickQuestion(question)}
              className="rounded-xl border border-border bg-background p-3 text-left text-sm transition-colors hover:bg-primary/5 dark:bg-white/5 dark:hover:bg-white/10"
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface TextPart {
  type: 'text';
  text: string;
}

interface MessageBubbleProps {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    parts?: Array<TextPart | { type: string; [key: string]: unknown }>;
    toolInvocations?: Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      state: 'partial-call' | 'call' | 'result';
      result?: unknown;
    }>;
  };
  agent: typeof agentsList[0] | undefined;
  onRegenerate?: () => void;
}

/**
 * Extract text content from a message, supporting both legacy content field
 * and AI SDK v4.2+ parts array format.
 */
function getMessageText(message: MessageBubbleProps['message']): string {
  // First check parts array (AI SDK v4.2+ format)
  if (message.parts && message.parts.length > 0) {
    const textParts = message.parts
      .filter((part): part is TextPart => part.type === 'text' && 'text' in part)
      .map(part => part.text);
    if (textParts.length > 0) {
      return textParts.join('');
    }
  }
  // Fall back to content field (legacy format)
  return message.content || '';
}

function MessageBubble({ message, agent, onRegenerate }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // Extract text from either parts (AI SDK v4.2+) or content (legacy)
  const messageText = getMessageText(message);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="mx-auto flex w-full max-w-3xl justify-end">
        <div className="max-w-[85%] rounded-3xl bg-primary/10 px-4 py-3 dark:bg-white/10">
          <p className="text-foreground whitespace-pre-wrap">{messageText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group mx-auto flex w-full max-w-3xl items-start gap-4">
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
        style={{ backgroundColor: agent?.backgroundColor || '#316049' }}
      >
        {agent?.avatar}
      </div>
      <div className="min-w-0 flex-1">
        {message.toolInvocations && message.toolInvocations.length > 0 && (
          <div className="mb-2">
            {message.toolInvocations.map((tool) => (
              <ToolCallUI
                key={tool.toolCallId}
                toolName={tool.toolName}
                args={tool.args}
                state={tool.state}
                result={tool.result}
              />
            ))}
          </div>
        )}

        {messageText && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownContent content={messageText} />
          </div>
        )}

        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Kopieren"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              aria-label="Neu generieren"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
