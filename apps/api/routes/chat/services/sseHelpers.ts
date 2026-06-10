/**
 * SSE (Server-Sent Events) Helpers
 *
 * Reusable utilities for streaming responses with progress events.
 * Used by chat controllers to provide real-time feedback during AI processing.
 */

import type { SharepicVariant } from './sharepicVariantHelpers.js';
import type {
  SearchIntent,
  SearchSource,
  GatherSource,
  GeneratedImageResult,
  ConfirmActionType,
  ChartData,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  CanvasAiSuggestion,
  TriggerDocEdit,
  TriggerBoardAction,
} from '@gruenerator/contracts';
import type { Response } from 'express';

/**
 * SSE event types for chat streaming.
 */
export type SSEEventType =
  | 'thread_created'
  | 'compound_start'
  | 'intent'
  | 'search_start'
  | 'search_complete'
  | 'summary_start'
  | 'summary_complete'
  | 'image_start'
  | 'image_complete'
  | 'sharepic_complete'
  | 'response_start'
  | 'thinking_step'
  | 'progress_step'
  | 'text_delta'
  | 'reasoning_delta'
  | 'fallback'
  | 'interrupt'
  | 'document_indexed'
  | 'document_created'
  | 'trigger_doc_edit'
  | 'trigger_board_action'
  | 'confirm_action'
  | 'chart_data'
  | 'memory_context'
  | 'completion'
  | 'canvas_operations_start'
  | 'canvas_operations'
  | 'canvas_operations_error'
  | 'done'
  // Non-fatal degradation the client should know about (context dropped,
  // unknown model id, …). Payload: { code, message }. Unknown event types
  // are ignored by older clients, so this is backwards-compatible.
  | 'warning'
  | 'error';

/**
 * Reasons a primary model can fail in a way that triggers fallback.
 */
export type FallbackReason = 'first_token_timeout' | 'empty_completion' | 'upstream_error';

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
 * Payload for deep agent thinking step events.
 * Emitted when the agent starts/completes a tool call.
 */
export interface ThinkingStepPayload {
  stepId: string;
  toolName: string;
  title: string;
  status: 'in_progress' | 'completed';
  args?: Record<string, unknown>;
  result?: {
    resultCount?: number;
    results?: unknown[];
    image?: GeneratedImageResult;
    error?: string;
  };
}

/**
 * Payload for internal pipeline-progress events (classify, rerank, brief).
 *
 * Shape mirrors ThinkingStepPayload but the *semantics* differ:
 * `thinking_step` is a user-facing tool call (search_examples, ask_human, …)
 * that renders a tool-card and persists in `allToolCalls`.
 * `progress_step` is a transient internal stage that drives ONLY the
 * progress indicator — it must NOT mutate the active/persisted tool-call
 * stream, or it clobbers the intent-derived tool-call between `intent`
 * and `search_complete` (the race that made every search→rerank flow
 * silently drop its rich tool-card).
 */
export type ProgressStepPayload = ThinkingStepPayload;

/**
 * SSE event payloads by type.
 */
export interface SSEEventPayloads {
  thread_created: { threadId: string };
  compound_start: {
    stages: GatherSource[];
    message: string;
  };
  intent: {
    intent: SearchIntent;
    secondaryIntent?: SearchIntent;
    message: string;
    reasoning?: string;
    searchQuery?: string;
    subQueries?: string[] | null;
    searchSources?: SearchSource[] | null;
    compound?: boolean;
  };
  search_start: { message: string; subQueries?: string[] };
  search_complete: {
    message: string;
    resultCount: number;
    results?: SearchResultPayload[];
    /**
     * For deep research: the rich orchestrator result (answer, citations,
     * confidence, searchSteps, followUpQuestions). Frontend stamps this onto
     * the research toolCall so ResearchArtifactCard renders during streaming
     * without waiting for persistence reload.
     */
    researchMeta?: unknown;
    /**
     * For examples / pressemitteilung_examples: kind-segmented rich items
     * matching the shapes the per-kind UI cards (PressemitteilungExamplesCard,
     * generic ToolCallUI) read. Frontend stamps the appropriate kind list
     * onto the tool-call's `result.examples` so the card renders mid-stream.
     */
    examplesResult?: { press?: unknown[]; social?: unknown[]; message?: string };
  };
  summary_start: { message: string; documentCount: number };
  summary_complete: { message: string; summaryLength: number; timeMs: number };
  image_start: { message: string };
  image_complete: {
    message: string;
    image?: GeneratedImageResult | null;
    error?: string;
  };
  sharepic_complete: {
    message: string;
    variants: SharepicVariant[];
    error?: string;
  };
  response_start: { message: string };
  thinking_step: ThinkingStepPayload;
  progress_step: ProgressStepPayload;
  text_delta: { text: string };
  reasoning_delta: { text: string };
  fallback: {
    from: { id: string; name: string };
    to: { id: string; name: string };
    reason: FallbackReason;
  };
  document_indexed: { documentId: string; title: string };
  document_created: { documentId: string; title: string; subtype: string; url: string };
  trigger_doc_edit: TriggerDocEdit;
  trigger_board_action: TriggerBoardAction;
  interrupt: {
    interruptType: 'clarification';
    question: string;
    options?: string[];
    threadId?: string;
  };
  confirm_action: {
    actionId: string;
    type: ConfirmActionType;
    title: string;
    description?: string;
    icon?: string;
    metadata?: Array<{ key: string; value: string }>;
    variant?: 'default' | 'destructive';
    confirmLabel?: string;
    cancelLabel?: string;
    threadId?: string;
  };
  memory_context: {
    memoryCount: number;
    memories: Array<{ content: string; category: string | null }>;
    isPersona: boolean;
  };
  chart_data: {
    chart: ChartData;
  };
  completion: {
    type?: 'completion';
    // Notebook flow emits `answer`; SearchGraph reuses this event with `text`.
    // Both are read by the frontend GrueneratorModelAdapter / NotebookModelAdapter
    // as the canonical, citation-renumbered final answer.
    answer?: string;
    text?: string;
    citations: unknown[];
    sources?: unknown[];
    allSources?: unknown[];
    sourcesByCollection?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  canvas_operations_start: { message: string };
  canvas_operations: { suggestions: CanvasAiSuggestion[] };
  canvas_operations_error: { error: string };
  done: {
    threadId?: string | null;
    citations?: unknown[];
    generatedImage?: GeneratedImageResult | null;
    interrupted?: boolean;
    metadata?: {
      intent: SearchIntent;
      searchCount: number;
      totalTimeMs: number;
      classificationTimeMs?: number;
      searchTimeMs?: number;
      imageTimeMs?: number;
      summaryTimeMs?: number;
      memoryRetrieveTimeMs?: number;
    };
  };
  warning: { code: string; message: string };
  error: { error: string };
}

/**
 * Picks a random element — used to vary user-facing status copy per chat turn.
 */
function pickOne<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * German status messages for each intent type. Each intent has a small pool of
 * playful, on-brand phrases; `getIntentMessage` picks one per turn so the same
 * intent feels fresh across messages. Register is mixed — cheeky for the
 * fast/creative intents, calmer for research and document edits. Entries keep
 * the trailing "..." progressive-action convention.
 */
export const INTENT_MESSAGE_POOLS: Record<SearchIntent, string[]> = {
  research: ['Recherchiere...', 'Grabe...', 'Sammle...'],
  compare: ['Vergleiche...', 'Stelle gegenüber...', 'Prüfe...'],
  search: ['Durchsuche...', 'Stöbere...', 'Wälze...'],
  // person: 'Suche Informationen zur Person...', // DISABLED: Person search not production ready
  web: ['Surfe...', 'Suche im Netz...', 'Recherchiere online...'],
  examples: ['Krame...', 'Hole Beispiele...', 'Suche Inspiration...'],
  pressemitteilung_examples: ['Suche Pressemitteilungen...', 'Blättere...', 'Hole Vorlagen...'],
  image: ['Generiere...', 'Male...', 'Zeichne...'],
  image_edit: ['Bearbeite...', 'Pinsele...', 'Retuschiere...'],
  sharepic: ['Gestalte...', 'Baue...', 'Erstelle...'],
  summary: ['Fasse zusammen...', 'Verdichte...', 'Bündele...'],
  chart: ['Zeichne...', 'Plotte...', 'Erstelle...'],
  save_as_doc: ['Speichere...', 'Sichere...', 'Archiviere...'],
  modify_doc: ['Bearbeite...', 'Ändere...', 'Überarbeite...'],
  edit_current_doc: ['Passe an...', 'Bearbeite...', 'Ändere...'],
  modify_board: ['Aktualisiere...', 'Ergänze...', 'Pflege...'],
  edit_current_board: ['Passe Board an...', 'Aktualisiere...', 'Pflege...'],
  share_doc: ['Teile...', 'Sende...', 'Reiche weiter...'],
  direct: ['Antworte...', 'Schreibe...', 'Formuliere...'],
};

/**
 * Progress messages for common stages.
 */
export const PROGRESS_MESSAGES = {
  compoundStart: (stages: number) => `Mehrstufige Anfrage erkannt (${stages} Quellen)...`,
  compoundGather: (source: string) =>
    source === 'notebook-search'
      ? 'Recherchiere in Notizbüchern...'
      : source === 'web-search'
        ? 'Suche im Web...'
        : 'Führe Recherche durch...',
  searchStart: 'Durchsuche Quellen...',
  searchComplete: (count: number) =>
    count > 0 ? `${count} relevante Quellen gefunden` : 'Keine passenden Quellen gefunden',
  summaryStart: 'Lese und analysiere Dokument(e)...',
  summaryComplete: (length: number, timeMs: number) =>
    `Zusammenfassung erstellt (${length} Zeichen, ${Math.round(timeMs / 1000)}s)`,
  imageStart: 'Generiere Bild...',
  imageComplete: 'Bild erfolgreich generiert',
  imageError: (error: string) => `Bildgenerierung fehlgeschlagen: ${error}`,
  imageEditStart: 'Bearbeite Bild mit KI...',
  imageEditComplete: 'Bild erfolgreich bearbeitet',
  imageEditNoAttachment: 'Bitte hänge ein Bild an, das bearbeitet werden soll.',
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
    if (this.ended || this.res.writableEnded || this.res.destroyed) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    (this.res as unknown as { flush?: () => void }).flush?.();
  }

  /**
   * Send a raw SSE event (for backwards compatibility).
   */
  sendRaw(event: string, data: unknown): void {
    if (this.ended || this.res.writableEnded || this.res.destroyed) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    (this.res as unknown as { flush?: () => void }).flush?.();
  }

  /**
   * End the SSE stream.
   */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.res.end();
    // @ts-rest/express's mainReqHandler unconditionally calls
    // res.status(...).json(...) after our handler resolves, which throws
    // ERR_HTTP_HEADERS_SENT once SSE headers are already flushed. Neutralise
    // the response writers so the wrapper's trailing call is a no-op.
    const noop = (): Response => this.res;
    this.res.json = noop;
    this.res.send = noop;
  }

  /**
   * Check if stream has ended.
   */
  isEnded(): boolean {
    return this.ended;
  }
}

/**
 * Get a German status message for an intent — one phrase picked at random from
 * the intent's pool, so the copy varies from one chat turn to the next.
 */
export function getIntentMessage(intent: SearchIntent): string {
  return pickOne(INTENT_MESSAGE_POOLS[intent] ?? ['Verarbeite Anfrage...']);
}

/**
 * Create an SSE writer with initialized headers.
 */
export function createSSEStream(res: Response): SSEWriter {
  SSEWriter.initHeaders(res);
  return new SSEWriter(res);
}

/**
 * Emit an SSE `error` event, close the stream, and return the ts-rest
 * handler result literal. Consolidates the
 * `sse.send('error', …); sse.end(); return { status: 200, body: undefined }`
 * pattern repeated across the chat-graph contract handlers.
 */
export function sseFail(sse: SSEWriter, error: string): { status: 200; body: undefined } {
  sse.send('error', { error });
  sse.end();
  return { status: 200 as const, body: undefined };
}
