'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { UIMessage } from 'ai';
import { useAgentStore, PROVIDER_OPTIONS } from '@/lib/store';
import { agentsList } from '@/lib/agents';
import apiClient from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import {
  Menu,
  Loader2,
  ArrowUp,
  Copy,
  Check,
  RotateCcw,
  Search,
  Sparkles,
  FileText,
} from 'lucide-react';
import { MarkdownContent } from './markdown-content';
import { ToolCallUI } from '../mcp-tool-ui/tool-call-ui';
import { ModelSelector } from './model-selector';
import { ToolToggles } from './tool-toggles';
import {
  useChatGraphStream,
  type ChatProgress,
  type ChatMessage,
} from '@/hooks/useChatGraphStream';

interface ChatMainProps {
  onMenuClick: () => void;
  userId?: string;
}

/**
 * Progress indicator component showing current processing stage.
 * Only shows for non-direct intents (search, research, etc.)
 */
function ProgressIndicator({
  progress,
  agentColor,
}: {
  progress: ChatProgress;
  agentColor: string;
}) {
  // Don't show progress for idle, complete, or direct intent
  if (
    progress.stage === 'idle' ||
    progress.stage === 'complete' ||
    progress.intent === 'direct'
  ) {
    return null;
  }

  // Only show during classifying if we don't know the intent yet
  // Once classified as direct, this won't render (handled above)
  if (progress.stage === 'classifying') {
    return null; // Don't show "Analysiere..." - wait until we know the intent
  }

  const getIcon = () => {
    switch (progress.stage) {
      case 'searching':
        return <Search className="h-4 w-4" />;
      case 'generating':
        return <FileText className="h-4 w-4" />;
      case 'error':
        return null;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        progress.stage === 'error'
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : 'bg-primary/5 text-foreground-muted'
      )}
    >
      {progress.stage !== 'error' && (
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ backgroundColor: agentColor }}
        >
          {getIcon()}
        </div>
      )}
      <span>{progress.message}</span>
      {progress.resultCount !== undefined && progress.resultCount > 0 && (
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: agentColor, color: 'white' }}
        >
          {progress.resultCount} Quellen
        </span>
      )}
    </div>
  );
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

  const currentProviderOption = PROVIDER_OPTIONS.find(
    (p) => p.id === selectedProvider
  );

  const selectedAgent = agentsList.find((a) => a.identifier === selectedAgentId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState('');

  // Use our custom SSE streaming hook
  const {
    messages,
    progress,
    streamingText,
    isLoading,
    threadId: hookThreadId,
    citations,
    sendMessage,
    setMessages,
    clearMessages,
    abort,
  } = useChatGraphStream({
    agentId: selectedAgentId,
    enabledTools,
    onThreadCreated: (newThreadId) => {
      const newThread = {
        id: newThreadId,
        title: 'Neue Unterhaltung',
        agentId: selectedAgentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      addThread(newThread);
      setCurrentThread(newThreadId);
    },
    onComplete: () => {
      if (currentThreadId || hookThreadId) {
        const threadToUpdate = currentThreadId || hookThreadId;
        if (threadToUpdate) {
          updateThread(threadToUpdate, { updatedAt: new Date() });
          incrementMessageCount();
          incrementMessageCount();

          if (needsCompaction && !compactionState.summary) {
            triggerCompaction(threadToUpdate);
          }
        }
      }
    },
    onError: (error) => {
      console.error('[Chat] Stream error:', error);
    },
  });

  // Load message history when thread changes
  useEffect(() => {
    async function loadMessages() {
      if (!currentThreadId || !userId) {
        clearMessages();
        return;
      }

      setIsLoadingHistory(true);
      try {
        const loadedMessages = await apiClient.get<UIMessage[]>(
          `/api/chat-service/messages?threadId=${currentThreadId}`
        );

        // Convert to our ChatMessage format
        const convertedMessages: ChatMessage[] = loadedMessages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : '',
          timestamp: Date.now(),
        }));

        setMessages(convertedMessages);
      } catch (error) {
        console.error('Error loading messages:', error);
        clearMessages();
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadMessages();
  }, [currentThreadId, userId, setMessages, clearMessages]);

  // Load compaction state when thread changes
  useEffect(() => {
    if (currentThreadId && userId) {
      loadCompactionState(currentThreadId);
    }
  }, [currentThreadId, userId, loadCompactionState]);

  // Clear messages when agent changes (no thread selected)
  useEffect(() => {
    if (!currentThreadId) {
      clearMessages();
    }
  }, [selectedAgentId, currentThreadId, clearMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleQuickQuestion = (question: string) => {
    setInput(question);
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const message = input;
      setInput('');
      await sendMessage(message);
    },
    [input, isLoading, sendMessage]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const showWelcome = messages.length === 0 && !isLoadingHistory && !isLoading;

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
            style={{
              backgroundColor: selectedAgent?.backgroundColor || '#316049',
            }}
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
                />
              ))}

              {/* Progress indicator and streaming text */}
              {isLoading && (
                <div className="mx-auto flex w-full max-w-3xl items-start gap-4">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
                    style={{
                      backgroundColor:
                        selectedAgent?.backgroundColor || '#316049',
                    }}
                  >
                    {selectedAgent?.avatar}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Progress indicator - only for search intents */}
                    <ProgressIndicator
                      progress={progress}
                      agentColor={selectedAgent?.backgroundColor || '#316049'}
                    />

                    {/* Streaming text preview */}
                    {streamingText && (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownContent content={streamingText} />
                      </div>
                    )}

                    {/* Typing indicator - show when:
                        1. Classifying (waiting for intent)
                        2. Direct intent generating (no search)
                        3. Search intent generating but no text yet */}
                    {!streamingText && (
                      progress.stage === 'classifying' ||
                      progress.stage === 'generating' ||
                      (progress.intent === 'direct' && progress.stage !== 'complete')
                    ) && (
                      <div className="flex items-center gap-2 pt-1 text-foreground-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Schreibe...</span>
                      </div>
                    )}
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
  agent: (typeof agentsList)[0] | undefined;
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
      <p className="mt-1 text-sm text-foreground-muted">{agent?.description}</p>

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

interface MessageBubbleProps {
  message: ChatMessage;
  agent: (typeof agentsList)[0] | undefined;
}

function MessageBubble({ message, agent }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="mx-auto flex w-full max-w-3xl justify-end">
        <div className="max-w-[85%] rounded-3xl bg-primary/10 px-4 py-3 dark:bg-white/10">
          <p className="whitespace-pre-wrap text-foreground">{message.content}</p>
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
        {message.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownContent content={message.content} />
          </div>
        )}

        {/* Show citation count if available */}
        {message.metadata?.citations && message.metadata.citations.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-foreground-muted">
            <FileText className="h-3 w-3" />
            <span>{message.metadata.citations.length} Quellen verwendet</span>
          </div>
        )}

        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Kopieren"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
