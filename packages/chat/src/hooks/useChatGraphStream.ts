/**
 * useChatGraphStream Hook
 *
 * Custom hook for streaming chat responses with SSE progress events.
 * Uses ChatAdapter for platform-agnostic API communication.
 */

import { useState, useCallback, useRef } from 'react';
import { useChatAdapter } from '../context/ChatContext';
import type { ProcessedFile } from '../lib/fileUtils';

export type ProgressStage =
  | 'idle'
  | 'classifying'
  | 'searching'
  | 'generating_image'
  | 'generating'
  | 'complete'
  | 'error';

export type SearchIntent = 'research' | 'search' | 'web' | 'examples' | 'image' | 'direct';

export interface GeneratedImage {
  base64: string;
  url: string;
  filename: string;
  prompt: string;
  style: 'illustration' | 'realistic' | 'pixel';
  generationTimeMs: number;
}

export interface ChatProgress {
  stage: ProgressStage;
  message: string;
  intent?: SearchIntent;
  resultCount?: number;
  reasoning?: string;
}

export interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResult {
  source: string;
  title: string;
  content: string;
  url?: string;
  relevance?: number;
}

export interface StreamMetadata {
  intent: SearchIntent;
  searchCount: number;
  totalTimeMs: number;
  classificationTimeMs?: number;
  searchTimeMs?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    citations?: Citation[];
    searchResults?: SearchResult[];
    intent?: SearchIntent;
    searchCount?: number;
    generatedImage?: GeneratedImage;
  };
}

export interface UseChatGraphStreamOptions {
  agentId?: string;
  modelId?: string;
  enabledTools?: Record<string, boolean>;
  onThreadCreated?: (threadId: string) => void;
  onError?: (error: string) => void;
  onComplete?: (metadata: StreamMetadata) => void;
}

export interface UseChatGraphStreamReturn {
  messages: ChatMessage[];
  progress: ChatProgress;
  streamingText: string;
  streamingSearchResults: SearchResult[];
  streamingImage: GeneratedImage | null;
  isLoading: boolean;
  threadId: string | null;
  citations: Citation[];
  sendMessage: (content: string, attachments?: ProcessedFile[]) => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  setThreadId: (threadId: string | null) => void;
  clearMessages: () => void;
  abort: () => void;
}

function parseSSELine(
  line: string,
  currentEvent: { type: string }
): { event?: string; data?: unknown } {
  if (line.startsWith('event: ')) {
    currentEvent.type = line.slice(7).trim();
    return {};
  }

  if (line.startsWith('data: ')) {
    try {
      const data = JSON.parse(line.slice(6));
      const event = currentEvent.type;
      currentEvent.type = '';
      return { event, data };
    } catch {
      return {};
    }
  }

  return {};
}

export function useChatGraphStream(
  options: UseChatGraphStreamOptions = {}
): UseChatGraphStreamReturn {
  const {
    agentId = 'gruenerator-universal',
    modelId,
    enabledTools,
    onThreadCreated,
    onError,
    onComplete,
  } = options;

  const adapter = useChatAdapter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState<ChatProgress>({
    stage: 'idle',
    message: '',
  });
  const [streamingText, setStreamingText] = useState('');
  const [streamingSearchResults, setStreamingSearchResults] = useState<SearchResult[]>([]);
  const [streamingImage, setStreamingImage] = useState<GeneratedImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setProgress({ stage: 'idle', message: '' });
    setStreamingText('');
    setStreamingSearchResults([]);
    setStreamingImage(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCitations([]);
    setThreadId(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string, attachments?: ProcessedFile[]) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setStreamingText('');
      setStreamingImage(null);
      setProgress({ stage: 'classifying', message: 'Analysiere Anfrage...' });

      abortControllerRef.current = new AbortController();

      try {
        const apiBaseUrl = adapter.getApiBaseUrl();

        const allMessages = [...(messages || []), userMessage];
        const formattedMessages = allMessages.map((m, idx) => {
          const parts: Array<
            | { type: 'text'; text: string }
            | { type: 'image'; image: string }
            | { type: 'file'; name: string; mimeType: string; data: string }
          > = [{ type: 'text' as const, text: m.content }];

          if (idx === allMessages.length - 1 && m.role === 'user' && attachments?.length) {
            for (const file of attachments) {
              if (file.isImage) {
                parts.push({ type: 'image' as const, image: file.data });
              } else {
                parts.push({
                  type: 'file' as const,
                  name: file.name,
                  mimeType: file.type,
                  data: file.data,
                });
              }
            }
          }

          return { id: m.id, role: m.role, parts };
        });

        const response = await adapter.fetch(`${apiBaseUrl}/api/chat-graph/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: formattedMessages,
            agentId,
            threadId,
            enabledTools,
            modelId,
            attachments: attachments || undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = { type: '' };
        let accumulatedText = '';
        let receivedCitations: Citation[] = [];
        let receivedSearchResults: SearchResult[] = [];
        let receivedImage: GeneratedImage | null = null;
        let receivedMetadata: StreamMetadata | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const { event, data } = parseSSELine(line, currentEvent);

            if (!event || !data) continue;

            switch (event) {
              case 'thread_created': {
                const { threadId: tid } = data as { threadId: string };
                setThreadId(tid);
                onThreadCreated?.(tid);
                break;
              }

              case 'intent': {
                const { intent, message, reasoning } = data as {
                  intent: SearchIntent;
                  message: string;
                  reasoning?: string;
                };
                let stage: ProgressStage = 'searching';
                if (intent === 'direct') {
                  stage = 'generating';
                } else if (intent === 'image') {
                  stage = 'generating_image';
                }
                setProgress({
                  stage,
                  message,
                  intent,
                  reasoning,
                });
                break;
              }

              case 'search_start': {
                const { message } = data as { message: string };
                setProgress((prev) => ({
                  ...prev,
                  stage: 'searching',
                  message,
                }));
                break;
              }

              case 'search_complete': {
                const { message, resultCount, results } = data as {
                  message: string;
                  resultCount: number;
                  results?: SearchResult[];
                };
                if (results) {
                  receivedSearchResults = results;
                  setStreamingSearchResults(results);
                }
                setProgress((prev) => ({
                  ...prev,
                  stage: 'generating',
                  message,
                  resultCount,
                }));
                break;
              }

              case 'image_start': {
                const { message } = data as { message: string };
                setProgress((prev) => ({
                  ...prev,
                  stage: 'generating_image',
                  message,
                }));
                break;
              }

              case 'image_complete': {
                const {
                  message,
                  image,
                  error: imageError,
                } = data as {
                  message: string;
                  image?: GeneratedImage;
                  error?: string;
                };
                if (image) {
                  receivedImage = image;
                  setStreamingImage(image);
                }
                setProgress((prev) => ({
                  ...prev,
                  stage: imageError ? 'error' : 'generating',
                  message,
                }));
                break;
              }

              case 'response_start': {
                const { message } = data as { message: string };
                setProgress((prev) => ({
                  ...prev,
                  stage: 'generating',
                  message,
                }));
                break;
              }

              case 'text_delta': {
                const { text } = data as { text: string };
                accumulatedText += text;
                setStreamingText(accumulatedText);
                break;
              }

              case 'done': {
                const {
                  citations: cit,
                  generatedImage: img,
                  metadata,
                } = data as {
                  threadId?: string;
                  citations?: Citation[];
                  generatedImage?: GeneratedImage;
                  metadata?: StreamMetadata;
                };
                if (cit) receivedCitations = cit;
                if (img) receivedImage = img;
                if (metadata) receivedMetadata = metadata;
                break;
              }

              case 'error': {
                const { error } = data as { error: string };
                throw new Error(error);
              }
            }
          }
        }

        if (accumulatedText || receivedImage) {
          const assistantMessage: ChatMessage = {
            id: `assistant_${Date.now()}`,
            role: 'assistant',
            content: accumulatedText,
            timestamp: Date.now(),
            metadata: {
              citations: receivedCitations,
              searchResults: receivedSearchResults.length > 0 ? receivedSearchResults : undefined,
              intent: receivedMetadata?.intent,
              searchCount: receivedMetadata?.searchCount,
              generatedImage: receivedImage || undefined,
            },
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setCitations(receivedCitations);

          if (receivedMetadata) {
            onComplete?.(receivedMetadata);
          }
        }

        setProgress({ stage: 'complete', message: '' });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[useChatGraphStream] Error:', errorMessage);
        setProgress({ stage: 'error', message: errorMessage });
        onError?.(errorMessage);
      } finally {
        setIsLoading(false);
        setStreamingText('');
        setStreamingSearchResults([]);
        setStreamingImage(null);
        abortControllerRef.current = null;
      }
    },
    [
      messages,
      threadId,
      agentId,
      modelId,
      enabledTools,
      isLoading,
      onThreadCreated,
      onComplete,
      onError,
      adapter,
    ]
  );

  return {
    messages,
    progress,
    streamingText,
    streamingSearchResults,
    streamingImage,
    isLoading,
    threadId,
    citations,
    sendMessage,
    setMessages,
    setThreadId,
    clearMessages,
    abort,
  };
}

export default useChatGraphStream;
