/**
 * SSE (Server-Sent Events) Helpers
 *
 * Reusable utilities for streaming responses with progress events.
 * Used by chat controllers to provide real-time feedback during AI processing.
 */

import type { Response } from 'express';
import type { SearchIntent, GeneratedImageResult } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * SSE event types for chat streaming.
 */
export type SSEEventType =
  | 'thread_created'
  | 'intent'
  | 'search_start'
  | 'search_complete'
  | 'image_start'
  | 'image_complete'
  | 'response_start'
  | 'text_delta'
  | 'done'
  | 'error';

/**
 * Search result structure sent to the client.
 */
export interface SearchResultPayload {
  source: string;
  title: string;
  content: string;
  url?: string;
  relevance?: number;
}

/**
 * SSE event payloads by type.
 */
export interface SSEEventPayloads {
  thread_created: { threadId: string };
  intent: { intent: SearchIntent; message: string; reasoning?: string };
  search_start: { message: string };
  search_complete: {
    message: string;
    resultCount: number;
    results?: SearchResultPayload[];
  };
  image_start: { message: string };
  image_complete: {
    message: string;
    image?: GeneratedImageResult | null;
    error?: string;
  };
  response_start: { message: string };
  text_delta: { text: string };
  done: {
    threadId?: string | null;
    citations?: unknown[];
    generatedImage?: GeneratedImageResult | null;
    metadata?: {
      intent: SearchIntent;
      searchCount: number;
      totalTimeMs: number;
      classificationTimeMs?: number;
      searchTimeMs?: number;
      imageTimeMs?: number;
      memoryRetrieveTimeMs?: number;
    };
  };
  error: { error: string };
}

/**
 * German status messages for each intent type.
 */
export const INTENT_MESSAGES: Record<SearchIntent, string> = {
  research: 'Recherchiere im Web und in Dokumenten...',
  search: 'Durchsuche Grüne Positionen und Programme...',
  // person: 'Suche Informationen zur Person...', // DISABLED: Person search not production ready
  web: 'Suche aktuelle Informationen im Web...',
  examples: 'Suche Social-Media-Beispiele...',
  image: 'Generiere Bild...',
  direct: 'Beantworte direkt...',
};

/**
 * Progress messages for common stages.
 */
export const PROGRESS_MESSAGES = {
  searchStart: 'Durchsuche Quellen...',
  searchComplete: (count: number) =>
    count > 0
      ? `${count} relevante Quellen gefunden`
      : 'Keine passenden Quellen gefunden',
  imageStart: 'Generiere Bild...',
  imageComplete: 'Bild erfolgreich generiert',
  imageError: (error: string) => `Bildgenerierung fehlgeschlagen: ${error}`,
  responseStart: 'Erstelle Antwort...',
  streamInterrupted: 'Stream interrupted',
  unauthorized: 'Unauthorized',
  aiUnavailable: 'AI service unavailable',
  messagesRequired: 'Messages array is required',
  internalError: 'Internal server error',
};

/**
 * SSE Stream Writer class for type-safe event emission.
 */
export class SSEWriter {
  private res: Response;
  private ended = false;

  constructor(res: Response) {
    this.res = res;
  }

  /**
   * Initialize SSE headers on the response.
   */
  static initHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }

  /**
   * Send a typed SSE event.
   */
  send<T extends SSEEventType>(event: T, data: SSEEventPayloads[T]): void {
    if (this.ended) return;
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Send a raw SSE event (for backwards compatibility).
   */
  sendRaw(event: string, data: unknown): void {
    if (this.ended) return;
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * End the SSE stream.
   */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.res.end();
  }

  /**
   * Check if stream has ended.
   */
  isEnded(): boolean {
    return this.ended;
  }
}

/**
 * Get the German status message for an intent.
 */
export function getIntentMessage(intent: SearchIntent): string {
  return INTENT_MESSAGES[intent] || 'Verarbeite Anfrage...';
}

/**
 * Create an SSE writer with initialized headers.
 */
export function createSSEStream(res: Response): SSEWriter {
  SSEWriter.initHeaders(res);
  return new SSEWriter(res);
}
