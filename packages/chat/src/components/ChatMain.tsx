'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAgentStore } from '../stores/chatStore';
import { agentsList } from '../lib/agents';
import { useChatAdapter, createApiClient } from '../context/ChatContext';
import { cn } from '../lib/utils';
import {
  Menu,
  Loader2,
  ArrowUp,
  Copy,
  Check,
  Search,
  FileText,
  ChevronDown,
  Image,
  Download,
  AlertCircle,
} from 'lucide-react';
import { FileUploadButton } from './FileUploadButton';
import { AttachedFilesPreview } from './AttachedFilesList';
import { validateFiles, prepareFilesForSubmission, type ProcessedFile } from '../lib/fileUtils';
import { MarkdownContent } from './MarkdownContent';
import { ToolCallUI } from './ToolCallUI';
import { ModelSelector } from './ModelSelector';
import { ToolToggles } from './ToolToggles';
import {
  useChatGraphStream,
  type ChatProgress,
  type ChatMessage,
  type SearchResult,
  type SearchIntent,
  type GeneratedImage,
} from '../hooks/useChatGraphStream';

interface ChatMainProps {
  onMenuClick: () => void;
  userId?: string;
}

function ProgressIndicator({
  progress,
  agentColor,
  searchResults,
}: {
  progress: ChatProgress;
  agentColor: string;
  searchResults?: SearchResult[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (progress.stage === 'idle' || progress.stage === 'complete' || progress.intent === 'direct') {
    return null;
  }

  const getIcon = () => {
    switch (progress.stage) {
      case 'classifying':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'searching':
        return <Search className="h-4 w-4" />;
      case 'generating_image':
        return <Image className="h-4 w-4" />;
      case 'generating':
        return <FileText className="h-4 w-4" />;
      case 'error':
        return null;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  const hasResults = searchResults && searchResults.length > 0;

  return (
    <div className="space-y-2">
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
        {hasResults && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: agentColor, color: 'white' }}
          >
            {searchResults.length} Quellen
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {hasResults && expanded && (
        <div className="ml-7 space-y-2">
          {searchResults.map((result, i) => (
            <div key={i} className="rounded-lg bg-background-secondary p-2 text-xs dark:bg-white/5">
              <div className="font-medium text-foreground">{result.title}</div>
              <p className="mt-0.5 line-clamp-1 text-foreground-muted">{result.content}</p>
              <div className="mt-0.5 flex items-center gap-2 text-foreground-muted">
                {result.url && (
                  <span className="text-primary">
                    {(() => {
                      try {
                        return new URL(result.url).hostname;
                      } catch {
                        return result.url;
                      }
                    })()}
                  </span>
                )}
                <span>{result.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatMain({ onMenuClick, userId }: ChatMainProps) {
  const adapter = useChatAdapter();
  const apiClient = useMemo(() => createApiClient(adapter), [adapter]);
  const {
    selectedAgentId,
    selectedModel,
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

  const selectedAgent = agentsList.find((a) => a.identifier === selectedAgentId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const {
    messages,
    progress,
    streamingText,
    streamingSearchResults,
    streamingImage,
    isLoading,
    threadId: hookThreadId,
    citations,
    sendMessage,
    setMessages,
    setThreadId: setHookThreadId,
    clearMessages,
    abort,
  } = useChatGraphStream({
    agentId: selectedAgentId,
    modelId: selectedModel,
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
            triggerCompaction(threadToUpdate, apiClient);
          }
        }
      }
    },
    onError: (error) => {
      console.error('[Chat] Stream error:', error);
    },
  });

  useEffect(() => {
    function extractContent(content: unknown): string {
      if (typeof content !== 'string') return '';

      if (content.startsWith('[{') && content.includes('"type":"text"')) {
        try {
          const parts = JSON.parse(content);
          if (Array.isArray(parts)) {
            return parts
              .filter(
                (p: unknown): p is { type: string; text: string } =>
                  p !== null &&
                  typeof p === 'object' &&
                  'type' in p &&
                  p.type === 'text' &&
                  'text' in p
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

    async function loadMessages() {
      if (!currentThreadId || !userId) {
        clearMessages();
        return;
      }

      setIsLoadingHistory(true);
      try {
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
              snippet: string;
            }>;
            searchResults?: Array<{
              source: string;
              title: string;
              content: string;
              url?: string;
              relevance?: number;
            }>;
            generatedImage?: {
              url: string;
              filename: string;
              prompt: string;
              style: 'illustration' | 'realistic' | 'pixel';
              generationTimeMs: number;
            };
          };
        }

        const loadedMessages = await apiClient.get<LoadedMessage[]>(
          `/api/chat-service/messages?threadId=${currentThreadId}`
        );

        const convertedMessages: ChatMessage[] = loadedMessages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: extractContent(m.content),
          timestamp: Date.now(),
          metadata: m.metadata
            ? {
                citations: m.metadata.citations,
                searchResults: m.metadata.searchResults,
                intent: m.metadata.intent as SearchIntent | undefined,
                searchCount: m.metadata.searchCount,
                generatedImage: m.metadata.generatedImage as GeneratedImage | undefined,
              }
            : undefined,
        }));

        setMessages(convertedMessages);
        setHookThreadId(currentThreadId);
      } catch (error) {
        console.error('Error loading messages:', error);
        clearMessages();
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadMessages();
  }, [currentThreadId, userId, setMessages, setHookThreadId, clearMessages, apiClient]);

  useEffect(() => {
    if (currentThreadId && userId) {
      loadCompactionState(currentThreadId, apiClient);
    }
  }, [currentThreadId, userId, loadCompactionState, apiClient]);

  useEffect(() => {
    if (!currentThreadId) {
      clearMessages();
    }
  }, [selectedAgentId, currentThreadId, clearMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleQuickQuestion = (question: string) => {
    setInput(question);
  };

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      setFileError(null);
      try {
        const newFiles = [...attachedFiles, ...files];
        validateFiles(newFiles);
        setAttachedFiles(newFiles);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Fehler beim Hinzufügen der Dateien';
        setFileError(errorMessage);
        setTimeout(() => setFileError(null), 5000);
      }
    },
    [attachedFiles]
  );

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const message = input;
      setInput('');
      setFileError(null);

      let processedFiles: ProcessedFile[] | undefined;
      if (attachedFiles.length > 0) {
        try {
          processedFiles = await prepareFilesForSubmission(attachedFiles);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Fehler beim Verarbeiten der Dateien';
          setFileError(errorMessage);
          setInput(message);
          return;
        }
      }

      setAttachedFiles([]);
      await sendMessage(message, processedFiles);
    },
    [input, isLoading, sendMessage, attachedFiles]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const showWelcome = messages.length === 0 && !isLoadingHistory && !isLoading;

  return (
    <div className="relative flex h-full flex-col bg-background dark:bg-[#1a1a1a]">
      <div className="floating-controls-wrapper">
        <div className="floating-controls-left">
          <button onClick={onMenuClick} className="floating-menu-button" aria-label="Menü öffnen">
            <Menu className="h-5 w-5" />
          </button>
          <ModelSelector />
        </div>
      </div>

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
            <WelcomeScreen agent={selectedAgent} onQuickQuestion={handleQuickQuestion} />
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} agent={selectedAgent} />
              ))}

              {isLoading && (
                <div className="mx-auto flex w-full max-w-3xl items-start gap-4">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
                    style={{
                      backgroundColor: selectedAgent?.backgroundColor || '#316049',
                    }}
                  >
                    {selectedAgent?.avatar}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <ProgressIndicator
                      progress={progress}
                      agentColor={selectedAgent?.backgroundColor || '#316049'}
                      searchResults={streamingSearchResults}
                    />

                    {streamingImage && <GeneratedImageDisplay image={streamingImage} />}

                    {streamingText && (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownContent content={streamingText} />
                      </div>
                    )}

                    {!streamingText &&
                      progress.intent === 'direct' &&
                      progress.stage !== 'complete' && (
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
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {fileError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {attachedFiles.length > 0 && (
            <AttachedFilesPreview files={attachedFiles} onRemove={handleRemoveFile} />
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl items-end rounded-3xl border border-border bg-background-secondary dark:bg-white/5"
        >
          <div className="input-tools-button flex items-center gap-1">
            <FileUploadButton onFilesSelected={handleFilesSelected} disabled={isLoading} />
            <ToolToggles />
          </div>
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder={`Nachricht an ${selectedAgent?.title || 'Assistent'}...`}
            rows={1}
            className="h-12 max-h-40 flex-grow resize-none bg-transparent p-3.5 pl-2 text-foreground outline-none placeholder:text-foreground-muted"
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
  const [isExporting, setIsExporting] = useState(false);
  const adapter = useChatAdapter();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDocx = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const apiBaseUrl = adapter.getApiBaseUrl();
      const response = await adapter.fetch(`${apiBaseUrl}/api/exports/chat-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: message.content,
          role: message.role,
          timestamp: message.timestamp,
          metadata: message.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || 'chat-nachricht.docx';

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
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
        {message.metadata?.generatedImage && (
          <GeneratedImageDisplay image={message.metadata.generatedImage} />
        )}

        {message.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownContent content={message.content} />
          </div>
        )}

        {message.metadata?.searchResults && message.metadata.searchResults.length > 0 && (
          <SearchResultsSection results={message.metadata.searchResults} />
        )}

        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Kopieren"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
            aria-label="Als Word-Dokument exportieren"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchResultsSection({ results }: { results: SearchResult[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground"
      >
        <FileText className="h-4 w-4" />
        <span>{results.length} Quellen verwendet</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {results.map((result, i) => (
            <div key={i} className="rounded-lg bg-background-secondary p-3 text-sm dark:bg-white/5">
              <div className="font-medium text-foreground">{result.title}</div>
              <p className="mt-1 line-clamp-2 text-foreground-muted">{result.content}</p>
              <div className="mt-1 flex items-center gap-2">
                {result.url && (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {new URL(result.url).hostname}
                  </a>
                )}
                <span className="text-xs text-foreground-muted">{result.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GeneratedImageDisplay({ image }: { image: GeneratedImage }) {
  const [isLoading, setIsLoading] = useState(true);

  const styleLabels: Record<GeneratedImage['style'], string> = {
    illustration: 'Illustration',
    realistic: 'Realistisch',
    pixel: 'Pixel Art',
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.base64 || image.url;
    link.download = image.filename || 'generated-image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mb-3 space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background-secondary">
            <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
          </div>
        )}
        <img
          src={image.base64 || image.url}
          alt="Generiertes Bild"
          className={cn(
            'max-h-[400px] w-auto rounded-lg transition-opacity',
            isLoading ? 'opacity-0' : 'opacity-100'
          )}
          onLoad={() => setIsLoading(false)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Image className="h-3 w-3" />
            {styleLabels[image.style]}
          </span>
          <span className="text-xs text-foreground-muted">
            {(image.generationTimeMs / 1000).toFixed(1)}s
          </span>
        </div>

        <button
          onClick={handleDownload}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label="Bild herunterladen"
        >
          <Download className="h-3 w-3" />
          <span>Herunterladen</span>
        </button>
      </div>
    </div>
  );
}
