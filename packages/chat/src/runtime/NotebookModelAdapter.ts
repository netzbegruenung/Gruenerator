import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';
import { type ChatProgress, type Citation as ChatCitation } from '../hooks/useChatGraphStream';
import { parseSSELine } from '../lib/sseParser';
import { useChatConfigStore } from '../stores/chatConfigStore';

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

export interface NotebookAdapterConfig {
  collectionId?: string;
  collectionIds?: string[];
  collectionLinkType?: string;
  filters?: Record<string, unknown>;
  locale?: string;
  extraParams?: Record<string, unknown>;
  mode?: 'fast' | 'deep';
  endpoint?: string;
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

      const payload = {
        messages: [{ role: 'user', content: question }],
        ...(isMulti
          ? { collectionIds: config.collectionIds }
          : { collectionId: config.collectionId || config.collectionIds?.[0] }),
        ...(config.filters && { filters: config.filters }),
        locale: config.locale,
        ...(config.mode && { mode: config.mode }),
        ...config.extraParams,
      };

      const { fetch: configFetch } = useChatConfigStore.getState();
      const endpoint = config.endpoint || '/api/chat-service/notebook/stream';
      const c0 = performance.now();
      console.debug('[Notebook] ⏱ Request sent to %s', endpoint);
      const response = await configFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (response.status === 429) {
          throw new Error(
            errorData.message ||
              errorData.error ||
              'Tageslimit erreicht. Bitte morgen erneut versuchen.'
          );
        }
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const currentEvent = { type: '' };
      let accumulatedText = '';
      let completionData: StreamCompletionData | null = null;
      let currentProgress: ChatProgress | undefined;
      let firstDeltaReceived = false;
      let lastYieldTime = 0;
      const YIELD_INTERVAL = 50; // ms — yields at most 20 times/sec

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
              case 'search_start': {
                const { message } = data as { message: string };
                console.debug(
                  `[Notebook] ⏱ Search started: ${Math.round(performance.now() - c0)}ms (network + auth)`
                );
                currentProgress = { stage: 'searching', message };
                yield {
                  content: [{ type: 'text' as const, text: '' }],
                  metadata: { custom: { progress: currentProgress } },
                };
                break;
              }

              case 'search_complete': {
                const { message, resultCount } = data as { message: string; resultCount: number };
                console.debug(
                  `[Notebook] ⏱ Search done: ${Math.round(performance.now() - c0)}ms, ${resultCount} results`
                );
                currentProgress = { stage: 'searching', ...currentProgress, message, resultCount };
                yield {
                  content: [{ type: 'text' as const, text: '' }],
                  metadata: { custom: { progress: currentProgress } },
                };
                break;
              }

              case 'response_start': {
                const { message } = data as { message: string };
                console.debug(`[Notebook] ⏱ Model ready: ${Math.round(performance.now() - c0)}ms`);
                currentProgress = { stage: 'generating', message };
                yield {
                  content: [{ type: 'text' as const, text: '' }],
                  metadata: { custom: { progress: currentProgress } },
                };
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
                  yield {
                    content: [
                      { type: 'text' as const, text: normalizeCiteMarkers(accumulatedText) },
                    ],
                    metadata: { custom: { progress: currentProgress } },
                  };
                  break;
                }

                const now = performance.now();
                if (now - lastYieldTime >= YIELD_INTERVAL) {
                  lastYieldTime = now;
                  yield {
                    content: [
                      { type: 'text' as const, text: normalizeCiteMarkers(accumulatedText) },
                    ],
                    metadata: { custom: { progress: currentProgress } },
                  };
                }
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
            }
          }

          // Flush any buffered text between read chunks
          if (accumulatedText && performance.now() - lastYieldTime >= YIELD_INTERVAL) {
            lastYieldTime = performance.now();
            yield {
              content: [{ type: 'text' as const, text: normalizeCiteMarkers(accumulatedText) }],
              metadata: { custom: { progress: currentProgress } },
            };
          }
        }
      } catch (readError: unknown) {
        const msg = readError instanceof Error ? readError.message : String(readError);
        if (abortSignal?.aborted) {
          return;
        }
        console.warn(
          '[Notebook] Stream read error after %d chars: %s',
          accumulatedText.length,
          msg
        );
        // Fall through to completionData/accumulatedText handling below
      }

      if (completionData) {
        const resultId = `qa-notebook-${Date.now()}`;
        const citations = completionData.citations || [];
        const sources = completionData.sources || [];
        const additionalSources = completionData.allSources || [];
        const sourcesByCollection = completionData.sourcesByCollection;

        let linkConfig: LinkConfig;
        if (isMulti || config.collectionLinkType === 'url') {
          linkConfig = {
            type: 'external',
            linkKey: 'document_id',
            titleKey: 'document_title',
            urlKey: 'url',
          };
        } else {
          linkConfig = {
            type: 'vectorDocument',
            linkKey: 'document_id',
            titleKey: 'document_title',
          };
        }

        const chatCitations = mapToChatCitations(citations);
        console.debug(
          '[Notebook] Completion: %d rawCitations, %d citations, answer length: %d',
          citations.length,
          chatCitations.length,
          completionData.answer.length
        );
        const metadata: NotebookMessageMetadata = {
          citations: chatCitations,
          rawCitations: citations,
          chatCitations,
          sources,
          additionalSources,
          linkConfig,
          question,
          resultId,
          answerText: completionData.answer,
          progress: { stage: 'complete', message: '' },
          ...(sourcesByCollection && { sourcesByCollection }),
        };

        yield {
          content: [{ type: 'text' as const, text: normalizeCiteMarkers(completionData.answer) }],
          metadata: { custom: metadata },
        };

        const tCb0 = performance.now();
        callbacks.onComplete?.(metadata);
        console.debug('[Notebook] ⏱ onComplete callback: %.1fms', performance.now() - tCb0);
        console.debug(`[Notebook] ⏱ Total: ${Math.round(performance.now() - c0)}ms`);
      } else if (accumulatedText) {
        yield {
          content: [{ type: 'text' as const, text: accumulatedText }],
        };
      } else {
        yield {
          content: [
            {
              type: 'text' as const,
              text: 'Leider konnte ich keine passende Antwort finden. Bitte versuche es mit einer anderen Frage.',
            },
          ],
        };
      }
    },
  };
}
