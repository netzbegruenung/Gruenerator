import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';
import {
  type ChatProgress,
  type Citation as ChatCitation,
  type FallbackInfo,
} from '../hooks/useChatGraphStream';
import { parseSSELine } from '../lib/sseParser';
import { useAgentStore } from '../stores/chatStore';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { streamErrorMessage } from './streamErrorMessage';

function normalizeCiteMarkers(text: string): string {
  return text.replace(/\[cite:(\d+)\]/g, '[$1]');
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
  mode?: 'fast' | 'deep';
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

export interface Citation {
  index: string;
  cited_text?: string;
  document_title?: string;
  document_id?: string;
  source_url?: string | null;
  similarity_score?: number;
  chunk_index?: number;
  filename?: string | null;
  page_number?: number | null;
  collection_id?: string;
  collection_name?: string;
}

export interface Source {
  document_id: string;
  document_title: string;
  source_url: string | null;
  chunk_text: string;
  similarity_score: number;
  citations: Citation[];
}

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

      const selectedModel = useAgentStore.getState().selectedModel;

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
        }
        try {
          const t = config.sharepicContext.getText?.();
          if (t && t.trim().length > 0) sharepicText = t;
        } catch (err) {
          console.warn('[Notebook] Sharepic getText failed:', err);
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

      const payload = {
        messages: [{ role: 'user', content: question }],
        ...(isMulti
          ? { collectionIds: config.collectionIds }
          : { collectionId: config.collectionId || config.collectionIds?.[0] }),
        ...(config.filters && { filters: config.filters }),
        locale: config.locale,
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
              text: streamErrorMessage(new Error('Keine Antwort vom Server erhalten.')),
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

              case 'completion': {
                completionData = data as StreamCompletionData;
                console.debug(
                  `[Notebook] ⏱ Stream done: ${Math.round(performance.now() - c0)}ms, ${(completionData.answer || '').length} chars, ${(completionData.citations || []).length} citations`
                );
                break;
              }

              case 'error': {
                const { error } = data as { error: string };
                throw new Error(error);
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
      } else if (accumulatedText) {
        yield buildResult();
      } else if (streamErrorEncountered) {
        // Stream errored before any answer arrived — surface the real cause
        // (e.g. backend `error` SSE event) instead of the misleading
        // "keine passende Antwort" fallback.
        yield {
          content: [{ type: 'text' as const, text: streamErrorMessage(streamErrorEncountered) }],
        };
      } else {
        accumulatedText =
          'Leider konnte ich keine passende Antwort finden. Bitte versuche es mit einer anderen Frage.';
        yield buildResult();
      }
    },
  };
}
