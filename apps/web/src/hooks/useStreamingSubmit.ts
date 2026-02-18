/**
 * useStreamingSubmit - SSE streaming variant of useApiSubmit
 *
 * Drop-in replacement that streams text generation via Server-Sent Events.
 * Falls back to non-streaming POST on SSE failure.
 */

import { useState, useRef, useCallback } from 'react';

import { processText } from '../components/utils/apiClient';
import { getDesktopToken } from '../utils/desktopAuth';
import { isDesktopApp } from '../utils/platform';
import { parseEndpointResponse } from '../utils/responseParser';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

interface StreamingProgress {
  stage: string;
  message: string;
}

interface ApiSubmitResponse {
  [key: string]: unknown;
}

interface UseStreamingSubmitReturn {
  loading: boolean;
  success: boolean;
  error: string;
  retryCount: number;
  submitForm: (formData: Record<string, unknown>) => Promise<ApiSubmitResponse>;
  resetSuccess: () => void;
  resetState: () => void;
  progress: StreamingProgress;
  streamingText: string;
  isStreaming: boolean;
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

const useStreamingSubmit = (endpoint: string, componentName: string): UseStreamingSubmitReturn => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [progress, setProgress] = useState<StreamingProgress>({ stage: '', message: '' });
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const textAccumulatorRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);

  const flushText = useCallback(() => {
    const text = textAccumulatorRef.current;
    setStreamingText(text);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushText();
    }, 30);
  }, [flushText]);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const submitForm = useCallback(
    async (formData: Record<string, unknown>): Promise<ApiSubmitResponse> => {
      setLoading(true);
      setSuccess(false);
      setError('');
      setRetryCount(0);
      setProgress({ stage: '', message: '' });
      setStreamingText('');
      textAccumulatorRef.current = '';

      // Signal streaming immediately so the UI can show the display section
      // before the HTTP response arrives (cuts out network latency from the UX gap)
      setIsStreaming(true);
      setProgress({ stage: 'preparing', message: 'Anfrage wird vorbereitet...' });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Build the streaming URL
      const separator = endpoint.includes('?') ? '&' : '?';
      const streamUrl = `${baseURL}${endpoint}${separator}stream=true`;

      // Prepare request data (same as useApiSubmit)
      const { onRetry, ...cleanFormData } = formData;
      const requestData: Record<string, unknown> = {
        ...cleanFormData,
        usePrivacyMode: !!formData.usePrivacyMode,
        useProMode: !!formData.useProMode,
        useBedrock: !!formData.useBedrock,
      };

      try {
        // Build headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };

        if (isDesktopApp()) {
          const token = await getDesktopToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }

        const response = await fetch(streamUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestData),
          credentials: isDesktopApp() ? 'omit' : 'include',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream')) {
          // Server responded with JSON instead of SSE — fallback
          const jsonResponse = await response.json();
          const parsed = parseEndpointResponse(jsonResponse, endpoint);
          if (!parsed.success) {
            throw new Error(parsed.error || 'Server response error');
          }
          setIsStreaming(false);
          setSuccess(true);
          setLoading(false);
          return parsed.metadata
            ? { ...parsed.metadata, content: parsed.content }
            : { content: parsed.content, metadata: {} };
        }

        // --- SSE streaming ---
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const currentEvent = { type: '' };
        let buffer = '';
        let fullContent = '';
        let donePayload: Record<string, unknown> | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            const { event, data } = parseSSELine(line, currentEvent);
            if (!event || !data) continue;

            const payload = data as Record<string, unknown>;

            switch (event) {
              case 'progress':
                setProgress({
                  stage: (payload.stage as string) || '',
                  message: (payload.message as string) || '',
                });
                break;

              case 'text_delta': {
                const chunk = (payload.text as string) || '';
                fullContent += chunk;
                textAccumulatorRef.current = fullContent;
                scheduleFlush();
                break;
              }

              case 'done':
                donePayload = payload;
                break;

              case 'error':
                throw new Error((payload.error as string) || 'Streaming error');
            }
          }
        }

        // Final flush
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        setStreamingText(fullContent);
        setIsStreaming(false);
        setSuccess(true);
        setLoading(false);

        // Return the final content + metadata for the caller to store
        const content = (donePayload?.content as string) || fullContent;
        const metadata = donePayload?.metadata || {};
        const enrichmentSummary = donePayload?.enrichmentSummary || {};

        return {
          content,
          metadata,
          enrichmentSummary,
        };
      } catch (err: unknown) {
        // Clean up flush timer
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }

        setIsStreaming(false);

        // If aborted, preserve partial text
        if (err instanceof DOMException && err.name === 'AbortError') {
          setLoading(false);
          // Return partial content if we have any
          if (textAccumulatorRef.current) {
            setSuccess(true);
            return { content: textAccumulatorRef.current, metadata: {} };
          }
          return { content: '', metadata: {} };
        }

        // Fallback to non-streaming
        console.warn('[useStreamingSubmit] SSE failed, falling back to non-streaming:', err);
        try {
          const response = (await processText(endpoint, {
            ...requestData,
            onRetry: (attempt: number, delay: number) => {
              setRetryCount(attempt);
              setError(
                `Verbindungsprobleme. Neuer Versuch in ${Math.round(delay / 1000)} Sekunden... (Versuch ${attempt}/3)`
              );
            },
          })) as ApiSubmitResponse;

          const parsed = parseEndpointResponse(response, endpoint);
          if (!parsed.success) {
            throw new Error(parsed.error || 'Empty response');
          }

          setSuccess(true);
          setLoading(false);
          return parsed.metadata
            ? { ...parsed.metadata, content: parsed.content }
            : { content: parsed.content, metadata: {} };
        } catch (fallbackErr: unknown) {
          const fallbackError =
            fallbackErr instanceof Error ? fallbackErr : new Error('Unknown error');
          setError(`${fallbackError.name || 'Fehler'}: ${fallbackError.message}`);
          setSuccess(false);
          setLoading(false);
          throw fallbackError;
        }
      }
    },
    [endpoint, scheduleFlush]
  );

  const resetSuccess = useCallback(() => {
    setSuccess(false);
  }, []);

  const resetState = useCallback(() => {
    setLoading(false);
    setSuccess(false);
    setError('');
    setRetryCount(0);
    setProgress({ stage: '', message: '' });
    setStreamingText('');
    setIsStreaming(false);
    textAccumulatorRef.current = '';
  }, []);

  return {
    loading,
    success,
    error,
    retryCount,
    submitForm,
    resetSuccess,
    resetState,
    progress,
    streamingText,
    isStreaming,
    abort,
  };
};

export default useStreamingSubmit;
