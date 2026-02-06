/**
 * useChatGraphStream Hook
 *
 * Custom hook for streaming chat responses with SSE progress events.
 * Parses server-sent events and provides real-time progress feedback.
 *
 * SSE Events:
 * - thread_created: New thread ID
 * - intent: Classification result with German message
 * - search_start: Search beginning
 * - search_complete: Search done with result count
 * - response_start: Generation beginning
 * - text_delta: Text chunks (accumulated)
 * - done: Final metadata
 * - error: Error message
 */

import { useState, useCallback, useRef } from 'react';
import apiClient from '@/lib/apiClient';

/**
 * Progress stages for the chat stream.
 */
export type ProgressStage =
  | 'idle'
  | 'classifying'
  | 'searching'
  | 'generating'
  | 'complete'
  | 'error';

/**
 * Intent types from the backend.
 */
export type SearchIntent =
  | 'research'
  | 'search'
  | 'person'
  | 'web'
  | 'examples'
  | 'direct';

/**
 * Progress state exposed by the hook.
 */
export interface ChatProgress {
  stage: ProgressStage;
  message: string;
  intent?: SearchIntent;
  resultCount?: number;
  reasoning?: string;
}

/**
 * Citation structure from search results.
 */
export interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

/**
 * Metadata from completion event.
 */
export interface StreamMetadata {
  intent: SearchIntent;
  searchCount: number;
  totalTimeMs: number;
  classificationTimeMs?: number;
  searchTimeMs?: number;
}

/**
 * Message structure for chat history.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    citations?: Citation[];
    intent?: SearchIntent;
    searchCount?: number;
  };
}

/**
 * Options for the chat stream hook.
 */
export interface UseChatGraphStreamOptions {
  agentId?: string;
  enabledTools?: Record<string, boolean>;
  onThreadCreated?: (threadId: string) => void;
  onError?: (error: string) => void;
  onComplete?: (metadata: StreamMetadata) => void;
}

/**
 * Return type for the hook.
 */
export interface UseChatGraphStreamReturn {
  messages: ChatMessage[];
  progress: ChatProgress;
  streamingText: string;
  isLoading: boolean;
  threadId: string | null;
  citations: Citation[];
  sendMessage: (content: string) => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  abort: () => void;
}

/**
 * Parse a single SSE event line.
 */
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

/**
 * Custom hook for chat streaming with SSE progress events.
 */
export function useChatGraphStream(
  options: UseChatGraphStreamOptions = {}
): UseChatGraphStreamReturn {
  const {
    agentId = 'gruenerator-universal',
    enabledTools,
    onThreadCreated,
    onError,
    onComplete,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState<ChatProgress>({
    stage: 'idle',
    message: '',
  });
  const [streamingText, setStreamingText] = useState('');
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
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCitations([]);
    setThreadId(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
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
      setProgress({ stage: 'classifying', message: 'Analysiere Anfrage...' });

      abortControllerRef.current = new AbortController();

      try {
        const apiBaseUrl = apiClient.getApiBaseUrl();

        // Build message array with proper UIMessage format (AI SDK v6 requires 'parts' not 'content')
        const allMessages = [...(messages || []), userMessage];
        const formattedMessages = allMessages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: 'text' as const, text: m.content }],
        }));

        const response = await fetch(`${apiBaseUrl}/api/chat-graph/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: formattedMessages,
            agentId,
            threadId,
            enabledTools,
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
        let receivedMetadata: StreamMetadata | null = null;
        let newThreadId: string | null = null;

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
                newThreadId = tid;
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
                // For search intents, set stage to 'searching' so progress indicator shows
                // For direct intent, set stage to 'generating' (skip search phase)
                setProgress({
                  stage: intent === 'direct' ? 'generating' : 'searching',
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
                const { message, resultCount } = data as {
                  message: string;
                  resultCount: number;
                };
                setProgress((prev) => ({
                  ...prev,
                  stage: 'generating',
                  message,
                  resultCount,
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
                const { citations: cit, metadata } = data as {
                  threadId?: string;
                  citations?: Citation[];
                  metadata?: StreamMetadata;
                };
                if (cit) receivedCitations = cit;
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

        // Finalize: add assistant message
        if (accumulatedText) {
          const assistantMessage: ChatMessage = {
            id: `assistant_${Date.now()}`,
            role: 'assistant',
            content: accumulatedText,
            timestamp: Date.now(),
            metadata: {
              citations: receivedCitations,
              intent: receivedMetadata?.intent,
              searchCount: receivedMetadata?.searchCount,
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

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[useChatGraphStream] Error:', errorMessage);
        setProgress({ stage: 'error', message: errorMessage });
        onError?.(errorMessage);
      } finally {
        setIsLoading(false);
        setStreamingText('');
        abortControllerRef.current = null;
      }
    },
    [
      messages,
      threadId,
      agentId,
      enabledTools,
      isLoading,
      onThreadCreated,
      onComplete,
      onError,
    ]
  );

  return {
    messages,
    progress,
    streamingText,
    isLoading,
    threadId,
    citations,
    sendMessage,
    setMessages,
    clearMessages,
    abort,
  };
}

export default useChatGraphStream;
