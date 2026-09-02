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
  SearchImagePayload,
  ThinkingStepPayload,
  SocialPostPayload,
  BahnPayload,
  ChatErrorCode,
  ChatWarningCode,
  ResearchLogStart,
  ResearchLogUpdate,
} from '@gruenerator/contracts';
import type { Response } from 'express';

// Wire shapes shared with the chat runtime parser — defined once in
// @gruenerator/contracts (chatStreamEvents) and re-exported for the emitters.
export type { SearchResultPayload, SearchImagePayload, ThinkingStepPayload };

/**
 * SSE event types for chat streaming.
 */
export type SSEEventType =
  | 'thread_created'
  | 'compound_start'
  | 'intent'
  | 'search_start'
  | 'search_complete'
  | 'search_images'
  | 'summary_start'
  | 'summary_complete'
  | 'image_start'
  | 'image_complete'
  | 'sharepic_complete'
  | 'sharepic_minted'
  | 'sharepic_updated'
  | 'sharepic_edit_error'
  | 'social_post_updated'
  | 'social_post_edit_error'
  | 'reel_processing'
  | 'reel_picker'
  | 'reel_updated'
  | 'reel_edit_error'
  | 'tool_step_start'
  | 'tool_step_result'
  | 'response_start'
  | 'thinking_step'
  | 'progress_step'
  | 'text_delta'
  | 'reasoning_delta'
  | 'gather_narration'
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
  // Live progress of a deep research run, rendered in the artifact side panel.
  // `_start` opens it, every `_update` merges into what is shown.
  | 'research_log_start'
  | 'research_log_update'
  | 'compute'
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
    /** Image hits. Never inside `results` — an image carries no text to cite. */
    images?: SearchImagePayload[];
  };
  /**
   * Image hits found inside the agentic loop.
   *
   * Its own event, because the loop sends no `search_complete` (it streams
   * `tool_step_*` cards instead) and because that event also moves the progress
   * stage — which must not happen while the model is still working. Carries the
   * turn's FULL list every time, so the client replaces rather than merges.
   */
  search_images: { images: SearchImagePayload[] };
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
    /** No variants because the model DECLINED on content grounds, not because
     *  generation failed; `message` carries the German reason. Deliberately
     *  distinct from `error` — a decline is the safety rules working, and
     *  reporting it as a failure invites the user to simply retry. */
    declined?: boolean;
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
  // Die Bearbeitung eines Posts aus der Zeit VOR der Stilllegung von
  // `social_post` (08/2026). `social_post_complete` stand hier als drittes
  // Ereignis und ist mit dem Erzeuger gefallen; die beiden hier sendet
  // `socialPostEditService`, der weiterläuft.
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
    narration?: string;
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
  gather_narration: { text: string };
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
    // 'tool_approval' = ein Werkzeugaufruf wartet auf die Freigabe der Person.
    interruptType: 'clarification' | 'client_tool' | 'tool_approval';
    question?: string;
    options?: string[];
    // client_tool only: which tool the client must run + its arguments.
    toolName?: string;
    args?: Record<string, unknown>;
    threadId?: string;
    // tool_approval only: die zurückgehaltenen Aufrufe dieses Model-Steps.
    approvalTurnId?: string;
    calls?: Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      title?: string;
      serverName?: string;
    }>;
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
  research_log_start: ResearchLogStart;
  research_log_update: ResearchLogUpdate;
  compute: {
    compute: ComputeData;
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
  hilfe: ['Blättere in der Doku...', 'Schlage die Anleitung nach...', 'Suche die Hilfeseite...'],
  wetter: ['Rufe Wettervorhersage ab...', 'Schaue in die Wolken...', 'Frage den DWD...'],
  news: ['Durchsuche Nachrichten...', 'Lese tagesschau...', 'Hole Schlagzeilen...'],
  image: ['Generiere...', 'Male...', 'Zeichne...'],
  image_edit: ['Bearbeite...', 'Pinsele...', 'Retuschiere...'],
  sharepic: ['Gestalte...', 'Baue...', 'Erstelle...'],
  // Stillgelegt (08/2026) — total über `SearchIntent`, wie bahn/umfragen.
  social_post: ['Texte deinen Post...', 'Schreibe...', 'Formuliere...'],
  summary: ['Fasse zusammen...', 'Verdichte...', 'Bündele...'],
  chart: ['Zeichne...', 'Plotte...', 'Erstelle...'],
  artifact: ['Baue...', 'Gestalte...', 'Erstelle...'],
  compute: ['Rechne...', 'Zähle...', 'Berechne...'],
  save_as_doc: ['Speichere...', 'Sichere...', 'Archiviere...'],
  create_sheet: ['Erstelle Tabelle...', 'Baue Spreadsheet...', 'Fülle Zellen...'],
  edit_sheet: ['Bearbeite Tabelle...', 'Passe Zellen an...'],
  create_pdf: ['Baue das PDF...', 'Setze das Dokument...', 'Gestalte die Seiten...'],
  create_presentation: ['Erstelle Präsentation...', 'Baue Folien...', 'Gestalte Slides...'],
  // Stillgelegt (09/2026) — total über `SearchIntent`, wie social_post.
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
  produktion: ['Schreibe...', 'Formuliere...', 'Setze um...'],
  direct: ['Antworte...', 'Schreibe...', 'Formuliere...'],
  greeting: ['Antworte...'],
  agentic: ['Schaue selbst nach...', 'Lege los...', 'Greife zu den Tools...'],
};

/**
 * Progress messages for common stages.
 */
export const PROGRESS_MESSAGES = {
  compoundStart: (stages: number) => `Mehrstufige Anfrage erkannt (${stages} Quellen)...`,
  compoundGather: (source: string) =>
    source === 'notebook-search'
      ? 'Recherchiere in Notebooks...'
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
  // Turn-persistence tap (WP-B): accumulates streamed reply text so a
  // placeholder DB row can be filled as the answer streams. Registered by the
  // chat-graph handler when a pending row exists; unset otherwise.
  private textListener: ((kind: 'delta' | 'completion', text: string) => void) | undefined;

  constructor(res: Response) {
    this.res = res;
  }

  /** Register (or clear) the turn-persistence text tap. */
  setTextListener(fn?: (kind: 'delta' | 'completion', text: string) => void): void {
    this.textListener = fn;
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
    // Tap text events BEFORE the writable guard: after a client disconnect the
    // server keeps streaming to completion, and the placeholder row must keep
    // accumulating so an aborted-on-the-client turn still persists in full.
    // `completion` carries the citation-clamped full text under `text` (the
    // chat-graph/agentic emitters use `text`; `answer` is the notebook flow,
    // which never registers a listener) — replace the buffer with it.
    if (this.textListener) {
      if (event === 'text_delta') {
        const t = (data as SSEEventPayloads['text_delta']).text;
        if (typeof t === 'string') this.textListener('delta', t);
      } else if (event === 'completion') {
        const t = (data as SSEEventPayloads['completion']).text;
        if (typeof t === 'string') this.textListener('completion', t);
      }
    }
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
 * Anything that can receive a typed SSE event — the real writer or a buffer.
 * Producers take this instead of `SSEWriter` when their output may need to be
 * held back and reviewed before it reaches the client.
 */
export interface SSEEmitter {
  send<T extends SSEEventType>(event: T, data: SSEEventPayloads[T]): void;
}

/**
 * Buffers events instead of writing them, so a caller can decide AFTER the fact
 * whether they may be sent.
 *
 * Why: the social-post sharepic half and text half run in parallel, and the
 * sharepic half streams `sharepic_complete` itself. A safety gate at the join
 * would arrive after the graphic was already on screen. Buffering keeps both
 * halves parallel (no added latency) while making the emit revocable.
 */
export interface DeferredSSE extends SSEEmitter {
  /** Write everything buffered so far to the real stream, then clear. */
  flush(sse: SSEWriter): void;
  /** Drop everything buffered — the events must never reach the client. */
  discard(): void;
  /** Number of events currently held. */
  readonly size: number;
}

export function createDeferredSSE(): DeferredSSE {
  const buffered: { event: SSEEventType; data: unknown }[] = [];
  return {
    send(event, data) {
      buffered.push({ event, data });
    },
    flush(sse) {
      for (const { event, data } of buffered) {
        sse.send(event, data as SSEEventPayloads[typeof event]);
      }
      buffered.length = 0;
    },
    discard() {
      buffered.length = 0;
    },
    get size() {
      return buffered.length;
    },
  };
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
 * Heartbeat interval shared by the step heartbeat below.
 *
 * There is deliberately NO heartbeat for the wait on a model's first content
 * token. One existed (`startResponseHeartbeat`, 27.07.2026) and re-sent a
 * `thinking_step` named `generating` every 3s — but `thinking_step` is the
 * TOOL channel: the client's parser turns every one of them into a tool-call
 * card (`parseSSEStream`, case 'thinking_step'), and this one never got a
 * matching `completed`, so a plain `direct` turn with a slow first token left a
 * card „generating — Formuliere Antwort…" spinning for the rest of the turn.
 * The window needs no event anyway: `response_start` already puts the
 * `generating` step in the list, and the status line shimmers on its own from
 * there. Anything that really must narrate this window uses `progress_step`
 * (see the note on that case in the parser), never `thinking_step`.
 */
const HEARTBEAT_INTERVAL_MS = 3_000;

/**
 * Derselbe Dienst für ein viel längeres Fenster: die Nachschritte eines
 * Pipeline-Agenten (`services/agentPipeline.ts`) laufen hinter einer bereits
 * fertig gestromten Antwort und schwiegen dabei am 14.08.2026 218 Sekunden am
 * Stück — ein Prüfbericht auf einer ausgelasteten Lane. Auf dem Bildschirm ist
 * das von einem Absturz nicht zu unterscheiden; die Person schickt den Turn
 * noch einmal, was dieselbe Lane weiter auslastet.
 *
 * Anders als beim Antwort-Heartbeat gibt es hier etwas zu sagen — der Schritt
 * hat einen Titel. Deshalb wiederholt sich sein EIGENES `progress_step` statt
 * eines generischen Ersatzes: der Client behandelt das Ereignis idempotent
 * (es setzt nur den Fortschritt, nie eine Werkzeugkarte), und der Titel bleibt
 * derselbe, den der Schritt zu Beginn gemeldet hat.
 */
export function startStepHeartbeat(sse: SSEWriter, payload: ProgressStepPayload): () => void {
  const handle = setInterval(() => {
    if (sse.isEnded()) return;
    sse.send('progress_step', payload);
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof handle.unref === 'function') handle.unref();
  let cleared = false;
  return () => {
    if (cleared) return;
    cleared = true;
    clearInterval(handle);
  };
}

/**
 * Non-fatal degradation warning when one or more search backends were
 * unreachable — shared by the primary and resume search pipelines so the
 * copy can't drift.
 */
export function sendSearchDegradedWarning(sse: SSEWriter, resultCount: number): void {
  sendChatWarning(
    sse,
    'search_degraded',
    resultCount === 0
      ? 'Die Quellensuche ist momentan gestört — es konnten keine Quellen abgerufen werden.'
      : 'Einige Quellen waren nicht erreichbar — die Antwort stützt sich auf unvollständige Suchergebnisse.'
  );
}

/**
 * Per-code metadata for the `warning` SSE event.
 *
 * `severity`/`attribution` are not rendered today — they classify the failure
 * for monitoring and drive future copy decisions (who owns the fix: the user,
 * the provider, or us).
 *
 * IMPORTANT: warning codes are machine vocabulary. Wherever the turn still has
 * a model available, the degradation is explained by the ANSWER (see
 * `degradationNotes`), and the warning is only the telemetry signal; `message`
 * is the curated fallback for the paths where no answer can carry it.
 *
 * To add a code: add it to `chatWarningCodeSchema` in @gruenerator/contracts,
 * then add its spec here — the `satisfies` below fails the build if either
 * half is missing.
 */
interface ChatWarningSpec {
  message: string;
  severity: 'info' | 'warning' | 'error';
  attribution: 'user' | 'provider' | 'system';
}

export const CHAT_WARNINGS = {
  search_degraded: {
    message: 'Einige Quellen waren nicht erreichbar — die Antwort nutzt unvollständige Ergebnisse.',
    severity: 'warning',
    attribution: 'provider',
  },
  wolke_refs_dropped: {
    message: 'Einige Wolke-Verweise konnten nicht aufgelöst werden.',
    severity: 'warning',
    attribution: 'user',
  },
  // Rug pull: a connected MCP server changed its tool DEFINITIONS since the
  // user approved them, so its tools were withheld from the model. `error`,
  // not `warning` — the user connected that server expecting it to work, and
  // the remedy (re-approve in settings) is theirs. The concrete server and tool
  // names arrive via messageOverride.
  mcp_tools_drifted: {
    message:
      'Ein verbundener MCP-Server hat seine Werkzeug-Beschreibungen seit der Freigabe geändert — seine Werkzeuge wurden nicht verwendet.',
    severity: 'error',
    attribution: 'user',
  },
  wolke_check_failed: {
    message: 'Die Wolke-Verbindung konnte nicht geprüft werden.',
    severity: 'warning',
    attribution: 'provider',
  },
  doc_creation_failed: {
    message: 'Das Dokument konnte nicht erstellt werden. Bitte versuche es noch einmal.',
    severity: 'error',
    attribution: 'system',
  },
  persist_failed: {
    message:
      'Die Nachricht konnte nicht gespeichert werden — der Verlauf ist möglicherweise unvollständig.',
    severity: 'error',
    attribution: 'system',
  },
  turn_discarded: {
    message: 'Diese Antwort wurde durch eine neuere Anfrage ersetzt.',
    severity: 'info',
    attribution: 'system',
  },
  board_creation_failed: {
    message: 'Das Board konnte nicht erstellt werden. Bitte versuche es noch einmal.',
    severity: 'error',
    attribution: 'system',
  },
  task_creation_failed: {
    message:
      'Die wiederkehrende Aufgabe konnte nicht eingerichtet werden. Bitte versuche es noch einmal.',
    severity: 'error',
    attribution: 'system',
  },
  sheet_creation_failed: {
    message: 'Die Tabelle konnte nicht erstellt werden. Bitte versuche es noch einmal.',
    severity: 'error',
    attribution: 'system',
  },
  presentation_creation_failed: {
    message: 'Die Präsentation konnte nicht erstellt werden. Bitte versuche es noch einmal.',
    severity: 'error',
    attribution: 'system',
  },
  sharepic_failed: {
    message: 'Das Sharepic konnte nicht erstellt werden — der Text ist trotzdem da.',
    severity: 'warning',
    attribution: 'system',
  },
  generation_failed: {
    message: 'Die Erstellung konnte nicht abgeschlossen werden.',
    severity: 'error',
    attribution: 'system',
  },
  edit_failed: {
    message: 'Die Bearbeitung konnte nicht ausgeführt werden. Bitte versuche es noch einmal.',
    severity: 'error',
    attribution: 'system',
  },
  source_unavailable: {
    message: 'Eine Quelle war nicht erreichbar — die Antwort entstand ohne sie.',
    severity: 'warning',
    attribution: 'provider',
  },
  rerank_degraded: {
    message: 'Die Quellenbewertung ist fehlgeschlagen — die Reihenfolge kann ungenauer sein.',
    severity: 'info',
    attribution: 'system',
  },
  research_plan_failed: {
    message: 'Die Recherche-Planung ist fehlgeschlagen — es wird direkt gesucht.',
    severity: 'info',
    attribution: 'system',
  },
  // Always sent with a messageOverride naming the reset time; this copy is the
  // fallback for a caller that has none.
  deep_research_quota_spent: {
    message:
      'Die Tiefenrecherche ist für heute aufgebraucht — ich habe stattdessen normal recherchiert.',
    severity: 'info',
    attribution: 'user',
  },
  deep_agent_failed: {
    message:
      'Der Recherche-Agent konnte den Bericht nicht fertigstellen — ich habe stattdessen direkt geantwortet. Dein Kontingent bleibt erhalten.',
    severity: 'warning',
    attribution: 'system',
  },
  classifier_degraded: {
    message:
      'Die Anfrage-Analyse war eingeschränkt — die Antwort nutzt eine vereinfachte Einordnung.',
    severity: 'info',
    attribution: 'system',
  },
  summary_partial: {
    message:
      'Teile des Dokuments konnten nicht geladen werden — die Zusammenfassung ist unvollständig.',
    severity: 'warning',
    attribution: 'system',
  },
  recall_degraded: {
    message: 'Frühere Chats konnten nicht durchsucht werden.',
    severity: 'warning',
    attribution: 'system',
  },
  connect_reauth_required: {
    message: 'Eine Verbindung ist abgelaufen — bitte in den Einstellungen neu verbinden.',
    severity: 'warning',
    attribution: 'user',
  },
  mention_context_failed: {
    message: 'Referenzierte Inhalte konnten nicht geladen werden — Antwort ohne diesen Kontext.',
    severity: 'warning',
    attribution: 'system',
  },
  extraction_failed: {
    message: 'Der Text aus einer angehängten Datei konnte nicht gelesen werden.',
    severity: 'warning',
    attribution: 'system',
  },
  mcp_unreachable: {
    message: 'Ein verbundener Dienst ist gerade nicht erreichbar.',
    severity: 'warning',
    attribution: 'provider',
  },
  mcp_not_consulted: {
    message: 'Der gewählte Server wurde für diese Anfrage nicht befragt.',
    severity: 'warning',
    attribution: 'user',
  },
  compute_failed: {
    message: 'Die Berechnung ist fehlgeschlagen — Zahlen in der Antwort sind ungeprüft.',
    severity: 'warning',
    attribution: 'system',
  },
  privacy_mode_degraded: {
    message:
      'Der Privacy-Modus konnte nicht angewendet werden — es wurde der Standard-Anbieter genutzt.',
    severity: 'warning',
    attribution: 'provider',
  },
  // Das Modell hat eine Quellennummer genannt, die es nicht bekommen hat. Der
  // Marker bleibt im Text (Löschen würde die Stelle verstecken); dieses Signal
  // zählt den Fall, den der Notebook-Prompt ausdrücklich verbietet.
  citation_invalid: {
    message: 'Eine Quellenangabe in der Antwort verweist auf keine bereitgestellte Quelle.',
    severity: 'warning',
    attribution: 'system',
  },
  // Der EINZIGE Ort dieses Satzes. Der Client rendert die Zeichenkette von der
  // Leitung und hält keine eigene Kopie — sonst gäbe es den Text zweimal und
  // eine Änderung erreichte nur die Hälfte der Flächen.
  //
  // `info`, nicht `warning`: es ist nichts ausgefallen. Das Retrieval hat
  // getan, was es soll, und meldet, dass die Sammlung zur Frage wenig hergibt.
  evidence_weak: {
    message:
      'Zu dieser Frage habe ich im Notebook wenig Passendes gefunden — bitte die angegebenen Quellen prüfen.',
    severity: 'info',
    attribution: 'system',
  },
} satisfies Record<ChatWarningCode, ChatWarningSpec>;

/**
 * Emit a non-fatal degradation warning. No-op once the stream has ended.
 *
 * `messageOverride` is for codes whose copy names a concrete subject (the
 * unavailable source, the expired provider); otherwise the spec's copy is used.
 */
export function sendChatWarning(
  sse: SSEWriter,
  code: ChatWarningCode,
  messageOverride?: string
): void {
  if (sse.isEnded()) return;
  sse.send('warning', { code, message: messageOverride ?? CHAT_WARNINGS[code].message });
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
