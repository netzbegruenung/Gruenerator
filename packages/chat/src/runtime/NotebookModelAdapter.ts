import {
  type ChatProgress,
  type Citation as ChatCitation,
  type FallbackInfo,
} from '../hooks/useChatGraphStream';
import { notifyWarning } from '../lib/notify';
import { AUTO_MODEL_ID, resolveAutoModel } from '../lib/resolveAutoModel';
import { parseSSELine } from '../lib/sseParser';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import {
  ChatStreamError,
  errorStatus,
  streamErrorMessage,
  STREAM_INTERRUPTED_MESSAGE,
} from './streamErrorMessage';

import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';
import type { NotebookCitation, NotebookDepth, NotebookSource } from '@gruenerator/contracts';

function normalizeCiteMarkers(text: string): string {
  return text.replace(/\[cite:(\d+)\]/g, '[$1]');
}

/** Client-side coarse cap on history length; the server holds the fine, token-based budget. */
const HISTORY_MAX_MESSAGES = 12;
/** Carried passages only need to identify the cited place, not repeat the chunk. */
const HISTORY_CITATION_TEXT_MAX_CHARS = 600;

interface WireHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<Record<string, unknown>>;
}

/**
 * Minimal subset of a raw notebook citation for the history payload — enough
 * for the server's carried-source merge (identity + passage), nothing more.
 */
function pickHistoryCitation(c: Record<string, unknown>): Record<string, unknown> {
  return {
    index: String(c.index ?? ''),
    ...(typeof c.document_id === 'string' && { document_id: c.document_id }),
    ...(typeof c.document_title === 'string' && { document_title: c.document_title }),
    ...(typeof c.title === 'string' && { title: c.title }),
    ...(typeof c.cited_text === 'string' && {
      cited_text: c.cited_text.slice(0, HISTORY_CITATION_TEXT_MAX_CHARS),
    }),
    ...(typeof c.source_url === 'string' && { source_url: c.source_url }),
    ...(typeof c.chunk_index === 'number' && { chunk_index: c.chunk_index }),
    ...(typeof c.page_number === 'number' && { page_number: c.page_number }),
    ...(typeof c.filename === 'string' && { filename: c.filename }),
    ...(typeof c.similarity_score === 'number' && { similarity_score: c.similarity_score }),
    ...(typeof c.collection_id === 'string' && { collection_id: c.collection_id }),
    ...(typeof c.collection_name === 'string' && { collection_name: c.collection_name }),
    ...(typeof c.date === 'string' && { date: c.date }),
  };
}

/**
 * Conversation history for the wire — every tier but `fast`. Prior messages
 * travel as `{role, content, citations?}`; `rawCitations` from the message
 * metadata (present after a live turn, a localStorage resume and a thread
 * reload) let the server merge previously cited sources into the new turn.
 */
function buildWireHistory(
  messages: ChatModelRunOptions['messages'],
  lastUserMessage: ChatModelRunOptions['messages'][number] | undefined
): WireHistoryMessage[] {
  if (!lastUserMessage) return [];
  const prior = messages.slice(0, messages.lastIndexOf(lastUserMessage));
  const history: WireHistoryMessage[] = [];
  for (const m of prior) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = m.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
      .trim();
    if (!text) continue;
    const raw = (m.metadata?.custom as Record<string, unknown> | undefined)?.rawCitations;
    const citations = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
          .filter((c) => c && typeof c === 'object')
          .map(pickHistoryCitation)
      : [];
    history.push({
      role: m.role,
      content: text,
      ...(citations.length > 0 && { citations }),
    });
  }
  return history.slice(-HISTORY_MAX_MESSAGES);
}

function mapToChatCitations(citations: Citation[]): ChatCitation[] {
  return citations.map((c) => ({
    id: parseInt(c.index, 10),
    title: c.document_title ?? '',
    url: c.source_url ?? '',
    snippet: c.cited_text ?? '',
    citedText: c.cited_text,
    source: c.collection_name ?? '',
    collectionName: c.collection_name,
    documentId: c.document_id,
    chunkIndex: c.chunk_index,
    similarityScore: c.similarity_score,
    pageNumber: c.page_number ?? null,
    collectionId: c.collection_id,
  }));
}

export interface SharepicContextConfig {
  captureImage?: () => Promise<string | null>;
  getText?: () => string;
  systemPrompt?: string;
}

export interface NotebookAdapterConfig {
  collectionId?: string;
  collectionIds?: string[];
  collectionLinkType?: string;
  filters?: Record<string, unknown>;
  locale?: string;
  extraParams?: Record<string, unknown>;
  /**
   * Dynamic counterpart to `extraParams` — evaluated at request time so the
   * payload can include values that must be fresh (e.g. a canvas snapshot
   * captured at the moment of submission). Merged on top of `extraParams`.
   */
  getExtraParams?: () => Record<string, unknown> | undefined;
  mode?: NotebookDepth;
  endpoint?: string;
  documentIds?: string[];
  threadId?: string | null;
  /** Optional sharepic context: per-message image + text + system prompt. */
  sharepicContext?: SharepicContextConfig;
  /**
   * Called for SSE events the adapter does not recognize. Lets specialized
   * surfaces (e.g. the canvas-editor in-section chat) pull custom events
   * like `canvas_operations` out of the stream without forking the adapter.
   */
  onCustomEvent?: (event: string, data: unknown) => void;
}

// Single source of truth: the notebook ask contract. These carry `date`
// (real source publication/upload date, or null) end-to-end.
export type Citation = NotebookCitation;
export type Source = NotebookSource;

export interface LinkConfig {
  type: 'external' | 'vectorDocument';
  linkKey: string;
  titleKey: string;
  urlKey?: string;
}

export interface NotebookMessageMetadata {
  citations: ChatCitation[];
  rawCitations: Citation[];
  sources: Source[];
  additionalSources: unknown[];
  linkConfig: LinkConfig;
  question: string;
  resultId: string;
  answerText: string;
  sourcesByCollection?: Record<string, unknown>;
  progress?: ChatProgress;
  /** @deprecated Use `citations` (ChatCitation[]) instead */
  chatCitations?: ChatCitation[];
  [key: string]: unknown;
}

interface StreamCompletionData {
  type: 'completion';
  answer: string;
  citations: Citation[];
  sources: Source[];
  allSources: unknown[];
  sourcesByCollection?: Record<string, unknown>;
  metadata?: { traceId?: string };
}

export interface NotebookAdapterCallbacks {
  onComplete?: (metadata: NotebookMessageMetadata) => void;
  onThreadCreated?: (threadId: string) => void;
}

export function createNotebookModelAdapter(
  getConfig: () => NotebookAdapterConfig,
  callbacks: NotebookAdapterCallbacks
): ChatModelAdapter {
  return {
    async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const { messages, abortSignal } = options;
      const config = getConfig();

      let lastUserMessage: (typeof messages)[number] | undefined;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserMessage = messages[i];
          break;
        }
      }
      const question =
        lastUserMessage?.content
          .filter((p: { type: string }): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p: { type: 'text'; text: string }) => p.text)
          .join('') || '';

      const isMulti =
        (config.collectionIds && config.collectionIds.length > 1) ||
        (!config.collectionId && config.collectionIds && config.collectionIds.length === 1);

      const rawSelectedModel = useAgentStore.getState().selectedModel;
      // Notebook surfaces are always notebook-scoped; pre-resolve 'auto' here so
      // the backend doesn't fall back to its generic DEFAULT_MODEL (gpt-oss).
      const selectedModel =
        rawSelectedModel === AUTO_MODEL_ID
          ? resolveAutoModel({ threadMode: 'notebook', agent: null })
          : rawSelectedModel;

      // Resolve optional sharepic context (canvas-editor in-section chat).
      // Captured before the request so image data + structured text travel with
      // the user's message and can be routed to a vision-capable model.
      let sharepicImage: string | null = null;
      let sharepicText: string | undefined;
      if (config.sharepicContext) {
        try {
          sharepicImage = (await config.sharepicContext.captureImage?.()) ?? null;
        } catch (err) {
          console.warn('[Notebook] Sharepic image capture failed:', err);
          notifyWarning(
            'Sharepic konnte nicht mitgeschickt werden',
            'Die Antwort entsteht ohne das aktuelle Bild.'
          );
        }
        try {
          const t = config.sharepicContext.getText?.();
          if (t && t.trim().length > 0) sharepicText = t;
        } catch (err) {
          console.warn('[Notebook] Sharepic getText failed:', err);
          notifyWarning(
            'Sharepic konnte nicht mitgeschickt werden',
            'Die Antwort entsteht ohne das aktuelle Bild.'
          );
        }
      }
      const sharepicSystemPrompt = config.sharepicContext?.systemPrompt;

      // Resolve dynamic extras at request time so values that must be fresh
      // (e.g. a canvas snapshot captured at submission) are not stale.
      let dynamicExtras: Record<string, unknown> | undefined;
      try {
        dynamicExtras = config.getExtraParams?.();
      } catch (err) {
        console.warn('[Notebook] getExtraParams threw:', err);
      }

      // The server's depth profile is the authority on what happens to
      // history (prompt inclusion is Ultra-only, `deep` rewrites the search
      // query against it) — the client just avoids shipping payload no tier
      // would use. `fast` (Grün-O-Mat) stays history-free.
      const wireHistory = config.mode !== 'fast' ? buildWireHistory(messages, lastUserMessage) : [];

      const payload = {
        messages: [...wireHistory, { role: 'user', content: question }],
        ...(isMulti
          ? { collectionIds: config.collectionIds }
          : { collectionId: config.collectionId || config.collectionIds?.[0] }),
        ...(config.filters && { filters: config.filters }),
        ...(config.mode && { mode: config.mode }),
        ...(config.documentIds?.length && { documentIds: config.documentIds }),
        ...(config.threadId && { threadId: config.threadId }),
        model: selectedModel,
        ...(sharepicImage && { sharepicImage }),
        ...(sharepicText && { sharepicText }),
        ...(sharepicSystemPrompt && { systemPrompt: sharepicSystemPrompt }),
        ...config.extraParams,
        ...dynamicExtras,
      };

      const { fetch: configFetch } = useChatConfigStore.getState();
      const endpoint = config.endpoint || '/api/chat-service/notebook/stream';
      const c0 = performance.now();
      console.debug('[Notebook] ⏱ Request sent to %s', endpoint);
      let response: Response;
      try {
        response = await configFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortSignal,
        });
      } catch (fetchError) {
        if (abortSignal?.aborted) return;
        // Network failure before any response — surface as an assistant message
        // so the user sees what happened in the conversation, not just in console.
        yield { content: [{ type: 'text' as const, text: streamErrorMessage(fetchError) }] };
        return;
      }

      if (!response.ok) {
        yield { content: [{ type: 'text' as const, text: streamErrorMessage(null, response) }] };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield {
          content: [
            {
              type: 'text' as const,
              text: streamErrorMessage(new ChatStreamError('Keine Antwort vom Server erhalten.')),
            },
          ],
        };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const currentEvent = { type: '' };
      let accumulatedText = '';
      let accumulatedReasoning = '';
      let completionData: StreamCompletionData | null = null;
      let currentProgress: ChatProgress | undefined;
      let firstDeltaReceived = false;
      let lastYieldTime = 0;
      const YIELD_INTERVAL = 50; // ms — yields at most 20 times/sec

      let completionCitations: ChatCitation[] = [];
      let rawCitationsAccum: Citation[] = [];
      let sourcesAccum: Source[] = [];
      let additionalSourcesAccum: unknown[] = [];
      let sourcesByCollectionAccum: Record<string, unknown> | undefined;
      let resultIdAccum: string | undefined;
      let linkConfigAccum: LinkConfig | undefined;
      let evidenceWeakAccum: string | undefined;

      function buildResult(): ChatModelRunResult {
        const custom: Record<string, unknown> = {};
        if (currentProgress) custom.progress = currentProgress;
        if (completionCitations.length > 0) custom.citations = completionCitations;
        if (rawCitationsAccum.length > 0) custom.rawCitations = rawCitationsAccum;
        if (completionCitations.length > 0) custom.chatCitations = completionCitations;
        if (sourcesAccum.length > 0) custom.sources = sourcesAccum;
        if (additionalSourcesAccum.length > 0) custom.additionalSources = additionalSourcesAccum;
        if (linkConfigAccum) custom.linkConfig = linkConfigAccum;
        if (resultIdAccum) custom.resultId = resultIdAccum;
        if (sourcesByCollectionAccum) custom.sourcesByCollection = sourcesByCollectionAccum;
        if (completionData?.metadata?.traceId) {
          custom.streamMetadata = {
            intent: 'direct',
            searchCount: 0,
            traceId: completionData.metadata.traceId,
          };
        }
        if (evidenceWeakAccum) custom.evidenceWeak = evidenceWeakAccum;
        custom.question = question;
        custom.answerText = accumulatedText;

        const parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }> =
          [];
        if (accumulatedReasoning) {
          parts.push({ type: 'reasoning' as const, text: accumulatedReasoning });
        }
        parts.push({ type: 'text' as const, text: normalizeCiteMarkers(accumulatedText) });

        return {
          content: parts,
          metadata: { custom },
        };
      }

      let streamErrorEncountered: unknown = null;
      try {
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
                const { threadId } = data as { threadId: string };
                console.debug('[Notebook] Thread created:', threadId);
                callbacks.onThreadCreated?.(threadId);
                break;
              }

              case 'search_start': {
                const { message } = data as { message: string };
                console.debug(
                  `[Notebook] ⏱ Search started: ${Math.round(performance.now() - c0)}ms (network + auth)`
                );
                currentProgress = { stage: 'searching', message };
                yield buildResult();
                break;
              }

              case 'search_complete': {
                const { message, resultCount } = data as { message: string; resultCount: number };
                console.debug(
                  `[Notebook] ⏱ Search done: ${Math.round(performance.now() - c0)}ms, ${resultCount} results`
                );
                currentProgress = { stage: 'searching', ...currentProgress, message, resultCount };
                yield buildResult();
                break;
              }

              case 'progress_step': {
                // An internal stage of the notebook pipeline — today only the
                // query expansion the Ultra tier runs before searching. Drives
                // the status line and nothing else: it must not touch tool
                // cards (see the chat adapter's case for why that matters).
                // Without this the event fell into `default:` and Ultra sat
                // silent through a search three times as long as Klein's.
                const { title } = data as {
                  stepId: string;
                  toolName: string;
                  title: string;
                  status: 'in_progress' | 'completed';
                };
                if (title) {
                  currentProgress = { ...currentProgress, stage: 'searching', message: title };
                  yield buildResult();
                }
                break;
              }

              case 'response_start': {
                const { message } = data as { message: string };
                console.debug(`[Notebook] ⏱ Model ready: ${Math.round(performance.now() - c0)}ms`);
                currentProgress = { stage: 'generating', message };
                yield buildResult();
                break;
              }

              case 'text_delta': {
                accumulatedText += (data as { text: string }).text;
                currentProgress = { stage: 'generating', message: '' };

                if (!firstDeltaReceived) {
                  firstDeltaReceived = true;
                  console.debug(
                    `[Notebook] ⏱ First token: ${Math.round(performance.now() - c0)}ms`
                  );
                  lastYieldTime = performance.now();
                  yield buildResult();
                  break;
                }

                const now = performance.now();
                if (now - lastYieldTime >= YIELD_INTERVAL) {
                  lastYieldTime = now;
                  yield buildResult();
                }
                break;
              }

              case 'reasoning_delta': {
                accumulatedReasoning += (data as { text: string }).text;
                currentProgress = { stage: 'generating', message: '' };
                const now = performance.now();
                if (now - lastYieldTime >= YIELD_INTERVAL) {
                  lastYieldTime = now;
                  yield buildResult();
                }
                break;
              }

              case 'fallback': {
                // Server switched models silently — log only, no UI.
                const info = data as FallbackInfo;
                console.warn(
                  `[Notebook] Model fallback: ${info.from.id} → ${info.to.id} (${info.reason})`
                );
                break;
              }

              case 'warning': {
                // Non-fatal degradation the backend wants the user to know
                // about. Without this case the event fell into `default:` and
                // was dropped on every notebook surface.
                const { code, message } = data as { code: string; message: string };
                // `evidence_weak` ist keine Störung, sondern eine Aussage über
                // GENAU DIESE Antwort. Ein Toast steht über der Seite und
                // gehört zu keiner Nachricht; der Satz gehört unter den Text.
                if (code === 'evidence_weak') {
                  if (message) evidenceWeakAccum = message;
                  break;
                }
                if (message) notifyWarning(message);
                break;
              }

              case 'completion': {
                completionData = data as StreamCompletionData;
                console.debug(
                  `[Notebook] ⏱ Stream done: ${Math.round(performance.now() - c0)}ms, ${(completionData.answer || '').length} chars, ${(completionData.citations || []).length} citations`
                );
                break;
              }

              case 'error': {
                const payload = data as {
                  error?: string;
                  code?: string;
                  retryable?: boolean;
                  retryAfterMs?: number;
                };
                throw new ChatStreamError(
                  payload.error ?? 'Es ist ein Fehler aufgetreten.',
                  payload
                );
              }

              default: {
                // Surface unrecognized events to consumers via callback.
                // Used by the canvas-editor chat to pull `canvas_operations`,
                // `canvas_operations_start`, and `canvas_operations_error`
                // out of the stream without forking the adapter.
                try {
                  config.onCustomEvent?.(event, data);
                } catch (err) {
                  console.warn(`[Notebook] onCustomEvent for "${event}" threw:`, err);
                }
                break;
              }
            }
          }

          // Flush any buffered text between read chunks
          if (accumulatedText && performance.now() - lastYieldTime >= YIELD_INTERVAL) {
            lastYieldTime = performance.now();
            yield buildResult();
          }
        }
      } catch (readError: unknown) {
        const msg = readError instanceof Error ? readError.message : String(readError);
        if (abortSignal?.aborted) {
          return;
        }
        streamErrorEncountered = readError;
        console.warn(
          '[Notebook] Stream read error after %d chars: %s',
          accumulatedText.length,
          msg
        );
        // Fall through to completionData/accumulatedText handling below
      }

      if (completionData) {
        resultIdAccum = `qa-notebook-${Date.now()}`;
        rawCitationsAccum = completionData.citations || [];
        sourcesAccum = completionData.sources || [];
        additionalSourcesAccum = completionData.allSources || [];
        sourcesByCollectionAccum = completionData.sourcesByCollection;

        if (isMulti || config.collectionLinkType === 'url') {
          linkConfigAccum = {
            type: 'external',
            linkKey: 'document_id',
            titleKey: 'document_title',
            urlKey: 'url',
          };
        } else {
          linkConfigAccum = {
            type: 'vectorDocument',
            linkKey: 'document_id',
            titleKey: 'document_title',
          };
        }

        completionCitations = mapToChatCitations(rawCitationsAccum);
        console.debug(
          '[Notebook] Completion: %d rawCitations, %d citations, answer length: %d streamed vs %d final',
          rawCitationsAccum.length,
          completionCitations.length,
          accumulatedText.length,
          completionData.answer.length
        );
        currentProgress = { stage: 'complete', message: '' };

        // Swap in the backend's canonical answer so citation IDs in the text
        // match completionCitations. The LLM emits raw IDs during streaming
        // (e.g. [23], [19], [24]) that the backend renumbers to dense
        // sequential IDs at completion — without this swap, markers point to
        // the wrong sources or fall off the map entirely.
        accumulatedText = completionData.answer;

        yield buildResult();

        const metadata: NotebookMessageMetadata = {
          citations: completionCitations,
          rawCitations: rawCitationsAccum,
          chatCitations: completionCitations,
          sources: sourcesAccum,
          additionalSources: additionalSourcesAccum,
          linkConfig: linkConfigAccum,
          question,
          resultId: resultIdAccum,
          answerText: completionData.answer,
          progress: { stage: 'complete', message: '' },
          ...(sourcesByCollectionAccum && { sourcesByCollection: sourcesByCollectionAccum }),
        };

        const tCb0 = performance.now();
        callbacks.onComplete?.(metadata);
        console.debug('[Notebook] ⏱ onComplete callback: %.1fms', performance.now() - tCb0);
        console.debug(`[Notebook] ⏱ Total: ${Math.round(performance.now() - c0)}ms`);
      } else if (accumulatedText && streamErrorEncountered) {
        // Partial answer + a stream error: the text must NOT be presented as
        // finished. Keep it (it is still worth reading), append the
        // interruption notice, and mark the turn failed so the retry
        // affordance appears.
        accumulatedText += `\n\n⚠️ **${STREAM_INTERRUPTED_MESSAGE}**`;
        yield { ...buildResult(), status: errorStatus(streamErrorEncountered) };
      } else if (accumulatedText) {
        yield buildResult();
      } else if (streamErrorEncountered) {
        // Stream errored before any answer arrived — surface the real cause
        // (e.g. backend `error` SSE event) instead of the misleading
        // "keine passende Antwort" fallback.
        yield {
          content: [{ type: 'text' as const, text: streamErrorMessage(streamErrorEncountered) }],
          status: errorStatus(streamErrorEncountered),
        };
      } else {
        accumulatedText =
          'Leider konnte ich keine passende Antwort finden. Bitte versuche es mit einer anderen Frage.';
        yield buildResult();
      }
    },
  };
}
