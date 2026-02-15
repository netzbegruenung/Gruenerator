/**
 * SSE Streaming Service for Deep Chat
 *
 * Manual SSE parser using fetch + ReadableStream (supported in RN 0.81/Hermes).
 * Connects to POST /api/chat-deep/stream with JWT bearer auth.
 */

import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface StreamCallbacks {
  onThreadCreated?: (threadId: string) => void;
  onThinkingStep?: (step: ThinkingStep) => void;
  onTextDelta?: (text: string) => void;
  onDone?: (data: DoneEvent) => void;
  onError?: (error: string) => void;
}

export interface ThinkingStep {
  stepId: string;
  toolName: string;
  title: string;
  status: 'in_progress' | 'completed';
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface Citation {
  id: number;
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  domain?: string;
}

export interface GeneratedImage {
  url: string;
  filename: string;
  prompt: string;
  style?: string;
}

export interface DoneEvent {
  threadId?: string;
  citations: Citation[];
  generatedImage?: GeneratedImage | null;
  metadata?: {
    intent?: string;
    searchCount?: number;
    totalTimeMs?: number;
  };
}

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamParams {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt?: Date;
    parts?: Array<{ type: string; text?: string }>;
  }>;
  agentId?: string;
  threadId?: string;
  enabledTools?: Record<string, boolean>;
}

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEBuffer(buffer: string): { events: SSEEvent[]; remainder: string } {
  const events: SSEEvent[] = [];
  const blocks = buffer.split('\n\n');

  // Last block might be incomplete
  const remainder = blocks.pop() || '';

  for (const block of blocks) {
    if (!block.trim()) continue;

    let event = 'message';
    let data = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (data) {
      events.push({ event, data });
    }
  }

  return { events, remainder };
}

export async function streamChatMessage(
  params: StreamParams,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const token = await secureStorage.getToken();
  console.log('[ChatStream] Token present:', !!token);
  if (!token) {
    callbacks.onError?.('Nicht angemeldet. Bitte melde dich erneut an.');
    return;
  }

  const url = `${API_BASE_URL}/chat-deep/stream`;
  console.log('[ChatStream] POST', url, 'messages:', params.messages.length);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        messages: params.messages,
        agentId: params.agentId || 'gruenerator-universal',
        threadId: params.threadId,
        enabledTools: params.enabledTools || {
          search: true,
          web: true,
          research: true,
          examples: true,
          image: true,
          image_edit: true,
        },
      }),
      signal: abortSignal,
    });
  } catch (fetchError) {
    console.error('[ChatStream] Fetch failed:', fetchError);
    callbacks.onError?.(fetchError instanceof Error ? fetchError.message : 'Verbindungsfehler');
    return;
  }

  console.log('[ChatStream] Response status:', response.status);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[ChatStream] Error response:', response.status, body);
    if (response.status === 401) {
      callbacks.onError?.('Sitzung abgelaufen. Bitte melde dich erneut an.');
    } else {
      callbacks.onError?.(`Serverfehler (${response.status}). Bitte versuche es erneut.`);
    }
    return;
  }

  if (!response.body) {
    console.error('[ChatStream] No response body (streaming not supported)');
    callbacks.onError?.('Streaming wird nicht unterstützt.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSSEBuffer(buffer);
      buffer = remainder;

      for (const sseEvent of events) {
        try {
          const data = JSON.parse(sseEvent.data);
          dispatchSSEEvent(sseEvent.event, data, callbacks);
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const { events } = parseSSEBuffer(buffer + '\n\n');
      for (const sseEvent of events) {
        try {
          const data = JSON.parse(sseEvent.data);
          dispatchSSEEvent(sseEvent.event, data, callbacks);
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    callbacks.onError?.(
      error instanceof Error ? error.message : 'Verbindungsfehler. Bitte versuche es erneut.'
    );
  }
}

function dispatchSSEEvent(
  event: string,
  data: Record<string, unknown>,
  callbacks: StreamCallbacks
): void {
  switch (event) {
    case 'thread_created':
      callbacks.onThreadCreated?.(data.threadId as string);
      break;

    case 'thinking_step':
      callbacks.onThinkingStep?.(data as unknown as ThinkingStep);
      break;

    case 'text_delta':
      callbacks.onTextDelta?.(data.text as string);
      break;

    case 'done':
      callbacks.onDone?.(data as unknown as DoneEvent);
      break;

    case 'error':
      callbacks.onError?.((data.error as string) || 'Unbekannter Fehler');
      break;
  }
}
