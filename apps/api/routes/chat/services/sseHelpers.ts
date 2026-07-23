/**
 * SSE (Server-Sent Events) Helpers
 *
 * Reusable utilities for streaming responses with progress events.
 * Used by chat controllers to provide real-time feedback during AI processing.
 */

import { AiProviderError } from '../../../services/providers/providerErrors.js';
import { captureSseError } from '../../../utils/observability/captureSseError.js';

import type { SharepicVariant } from './sharepicVariantHelpers.js';
import type {
  SearchIntent,
  SearchSource,
  GatherSource,
  GeneratedImageResult,
  ConfirmActionType,
  ChartData,
  ArtifactData,
  ComputeData,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  CanvasAiSuggestion,
  ReelPickerProject,
  TriggerDocEdit,
  TriggerBoardAction,
  ConfirmActionEvent,
  DocumentCreatedEvent,
  EditorOperationsEvent,
  SearchResultPayload,
  ThinkingStepPayload,
  SocialPostPayload,
  BundestagPayload,
  BahnPayload,
  ChatErrorCode,
} from '@gruenerator/contracts';
import type { Response } from 'express';

// Wire shapes shared with the chat runtime parser — defined once in
// @gruenerator/contracts (chatStreamEvents) and re-exported for the emitters.
export type { SearchResultPayload, ThinkingStepPayload };

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
  | 'sharepic_minted'
  | 'sharepic_updated'
  | 'sharepic_edit_error'
  | 'social_post_complete'
  | 'social_post_updated'
  | 'social_post_edit_error'
  | 'reel_processing'
  | 'reel_picker'
  | 'reel_updated'
  | 'reel_edit_error'
  | 'mcp_tool_error'
  | 'tool_step_start'
  | 'tool_step_result'
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
  | 'editor_operations'
  | 'confirm_action'
  | 'chart_data'
  | 'artifact'
  | 'compute'
  | 'bundestag'
  | 'bahn'
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
    /** Agentic respond path drives the tool loop — real tool_step_* cards
     *  follow, so the client skips the intent-fabricated tool card. */
    agentic?: boolean;
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
  sharepic_minted: { variantId: string; canvasId: string };
  sharepic_updated: {
    variantId: string;
    canvasId: string;
    version: number;
    canvasType: string;
    /** Single sharepics send `state`; decks send `pages` instead. */
    state?: Record<string, unknown>;
    pages?: Array<Record<string, unknown>>;
    summary: string;
  };
  sharepic_edit_error: { variantId?: string; error: string };
  // Combined social post (EXPERIMENTAL): text half. Sharepic variants keep
  // travelling via sharepic_complete so the whole variant machinery
  // (mint/edit/live store) stays untouched.
  social_post_complete: {
    message: string;
    post?: SocialPostPayload;
    error?: string;
  };
  social_post_updated: {
    postId: string;
    post: SocialPostPayload;
    summary: string;
  };
  social_post_edit_error: { postId?: string; error: string };
  // Reel branch (chat subtitle editing of subtitler projects). The frontend
  // polls GET /subtitler/auto-progress/:uploadId after reel_processing; full
  // segments travel via reel_updated only (compact tool results in the DB).
  reel_processing: { uploadId: string; filename: string };
  reel_picker: { projects: ReelPickerProject[] };
  reel_updated: {
    projectId: string;
    title: string;
    segments: Array<{ id: number; startTime: number; endTime: number; text: string }>;
    summary: string;
    changedIndices: number[];
  };
  reel_edit_error: { projectId?: string; error: string };
  // Connector (user MCP) tool failure — a first-class, user-facing error the
  // frontend can render as a banner. The generic tool_step_result{ok:false}
  // card still fires; this names the server and the human-readable error so the
  // failure isn't only implied by a greyed-out tool card.
  mcp_tool_error: { toolName: string; serverName: string; error: string };
  // Agentic tool loop: one start/result pair per tool step. Args/summaries are
  // compact display data. `title`/`serverName` label the card (MCP/connector
  // tools); `result` carries the rich per-tool payload the UI cards read
  // (results/examples/researchMeta) so they render mid-stream without waiting
  // for the persistence reload.
  tool_step_start: {
    stepId: string;
    toolName: string;
    args?: Record<string, unknown>;
    title?: string;
    serverName?: string;
  };
  tool_step_result: {
    stepId: string;
    toolName: string;
    ok: boolean;
    summary?: string;
    result?: Record<string, unknown>;
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
  document_created: DocumentCreatedEvent;
  trigger_doc_edit: TriggerDocEdit;
  trigger_board_action: TriggerBoardAction;
  editor_operations: EditorOperationsEvent;
  interrupt: {
    // 'clarification' = ask_human (a human answers via UI). 'client_tool' = a
    // client-executed tool (e.g. run_python) whose result the browser produces
    // automatically and posts back to resume the same turn.
    interruptType: 'clarification' | 'client_tool';
    question?: string;
    options?: string[];
    // client_tool only: which tool the client must run + its arguments.
    toolName?: string;
    args?: Record<string, unknown>;
    threadId?: string;
  };
  confirm_action: ConfirmActionEvent;
  memory_context: {
    memoryCount: number;
    memories: Array<{ content: string; category: string | null }>;
    isPersona: boolean;
  };
  chart_data: {
    chart: ChartData;
  };
  artifact: {
    artifact: ArtifactData;
  };
  compute: {
    compute: ComputeData;
  };
  bundestag: {
    bundestag: BundestagPayload;
  };
  bahn: {
    bahn: BahnPayload;
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
  error: {
    /** Human-readable German message — the only field pre-taxonomy clients read. */
    error: string;
    code?: ChatErrorCode;
    /** Whether resending the same request has a realistic chance of succeeding. */
    retryable?: boolean;
    retryAfterMs?: number;
  };
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
  scrape_url: ['Lese Webseite...', 'Öffne den Link...', 'Rufe die Seite ab...'],
  examples: ['Krame...', 'Hole Beispiele...', 'Suche Inspiration...'],
  pressemitteilung_examples: ['Suche Pressemitteilungen...', 'Blättere...', 'Hole Vorlagen...'],
  abgeordnetenwatch: ['Prüfe Abgeordnetenwatch...', 'Rufe Mandatsdaten ab...', 'Zähle Stimmen...'],
  bundestag: ['Durchsuche das DIP...', 'Blättere Drucksachen...', 'Höre Reden nach...'],
  bahn: ['Suche Zugverbindungen...', 'Frage den Fahrplan ab...', 'Prüfe Abfahrtszeiten...'],
  reise: ['Plane die Reise...', 'Suche Zug und Unterkunft...', 'Stelle Reiseoptionen zusammen...'],
  hotel: ['Suche Unterkünfte...', 'Vergleiche Hotels...', 'Prüfe Verfügbarkeiten...'],
  umfragen: ['Frage Umfragewerte ab...', 'Lese die Sonntagsfrage...', 'Hole PolitPro-Daten...'],
  wetter: ['Rufe Wettervorhersage ab...', 'Schaue in die Wolken...', 'Frage den DWD...'],
  news: ['Durchsuche Nachrichten...', 'Lese tagesschau...', 'Hole Schlagzeilen...'],
  image: ['Generiere...', 'Male...', 'Zeichne...'],
  image_edit: ['Bearbeite...', 'Pinsele...', 'Retuschiere...'],
  sharepic: ['Gestalte...', 'Baue...', 'Erstelle...'],
  social_post: ['Texte und gestalte...', 'Baue deinen Post...', 'Schreibe und gestalte...'],
  summary: ['Fasse zusammen...', 'Verdichte...', 'Bündele...'],
  chart: ['Zeichne...', 'Plotte...', 'Erstelle...'],
  artifact: ['Baue...', 'Gestalte...', 'Erstelle...'],
  compute: ['Rechne...', 'Zähle...', 'Berechne...'],
  save_as_doc: ['Speichere...', 'Sichere...', 'Archiviere...'],
  create_sheet: ['Erstelle Tabelle...', 'Baue Spreadsheet...', 'Fülle Zellen...'],
  create_presentation: ['Erstelle Präsentation...', 'Baue Folien...', 'Gestalte Slides...'],
  create_recurring_task: [
    'Richte wiederkehrende Aufgabe ein...',
    'Plane den Rhythmus...',
    'Speichere den Zeitplan...',
  ],
  modify_doc: ['Bearbeite...', 'Ändere...', 'Überarbeite...'],
  edit_current_doc: ['Passe an...', 'Bearbeite...', 'Ändere...'],
  modify_board: ['Aktualisiere...', 'Ergänze...', 'Pflege...'],
  edit_current_board: ['Passe Board an...', 'Aktualisiere...', 'Pflege...'],
  share_doc: ['Teile...', 'Sende...', 'Reiche weiter...'],
  chat_history: [
    'Blättere in alten Gesprächen...',
    'Krame in Erinnerungen...',
    'Suche vergangene Chats...',
  ],
  mcp: ['Verbinde Tools...', 'Rufe externes Tool auf...', 'Frage verbundenen Dienst...'],
  direct: ['Antworte...', 'Schreibe...', 'Formuliere...'],
  agentic: ['Schaue selbst nach...', 'Lege los...', 'Greife zu den Tools...'],
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
  searchDegraded: 'Quellen derzeit nicht erreichbar',
  rateLimited: 'Anfragelimit erreicht. Bitte warte einen Moment und versuche es dann erneut.',
  invalidRequest: 'Deine Anfrage konnte nicht verarbeitet werden.',
  streamInterrupted:
    'Die Verbindung zum KI-Dienst wurde unterbrochen — die Antwort ist möglicherweise unvollständig.',
  unauthorized: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  aiUnavailable:
    'Der KI-Dienst ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.',
  messagesRequired: 'Die Anfrage enthielt keine Nachrichten.',
  internalError: 'Es ist ein interner Fehler aufgetreten. Bitte versuche es erneut.',
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
    // Mirror every in-band `error` event to Sentry/GlitchTip. These are written
    // onto an already-200 stream, so they never throw and are otherwise
    // invisible to monitoring. Capture only on actual emit (past the writable
    // guard) so client disconnects don't generate noise.
    if (event === 'error') {
      const payload = data as SSEEventPayloads['error'];
      captureSseError({
        message: payload.error,
        ...(payload.code && { code: payload.code }),
      });
    }
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
export function sseFail(
  sse: SSEWriter,
  error: string,
  meta?: { code?: ChatErrorCode; retryable?: boolean; retryAfterMs?: number }
): { status: 200; body: undefined } {
  sse.send('error', { error, ...meta });
  sse.end();
  return { status: 200 as const, body: undefined };
}

/**
 * Non-fatal degradation warning when one or more search backends were
 * unreachable — shared by the primary and resume search pipelines so the
 * copy can't drift.
 */
export function sendSearchDegradedWarning(sse: SSEWriter, resultCount: number): void {
  sse.send('warning', {
    code: 'search_degraded',
    message:
      resultCount === 0
        ? 'Die Quellensuche ist momentan gestört — es konnten keine Quellen abgerufen werden.'
        : 'Einige Quellen waren nicht erreichbar — die Antwort stützt sich auf unvollständige Suchergebnisse.',
  });
}

/**
 * Catch-all error emit shared by the stream handlers' outer catches. Worker
 * failures cross the thread boundary as AiProviderError and keep their
 * classification here (rate limit vs provider down vs bad request); anything
 * else reports as 'internal'. No-op when the stream already ended.
 */
export function sseInternalError(sse: SSEWriter, error: unknown): void {
  if (sse.isEnded()) return;
  sse.send('error', chatErrorPayloadFromException(error));
  sse.end();
}

function chatErrorPayloadFromException(error: unknown): SSEEventPayloads['error'] {
  if (error instanceof AiProviderError) {
    switch (error.code) {
      case 'rate_limited':
        return { error: PROGRESS_MESSAGES.rateLimited, code: 'rate_limited', retryable: true };
      case 'provider_unavailable':
      case 'timeout':
        return {
          error: PROGRESS_MESSAGES.aiUnavailable,
          code: 'provider_unavailable',
          retryable: true,
        };
      case 'invalid_request':
        return {
          error: PROGRESS_MESSAGES.invalidRequest,
          code: 'invalid_request',
          retryable: false,
        };
      case 'unknown':
        break;
    }
  }
  return { error: PROGRESS_MESSAGES.internalError, code: 'internal', retryable: true };
}
