import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';
import { useChatConfigStore } from '../stores/chatConfigStore';

export interface NotebookAdapterConfig {
  collectionId?: string;
  collectionIds?: string[];
  collectionLinkType?: string;
  filters?: Record<string, unknown>;
  locale?: string;
  extraParams?: Record<string, unknown>;
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
  citations: Citation[];
  sources: Source[];
  additionalSources: unknown[];
  linkConfig: LinkConfig;
  question: string;
  resultId: string;
  answerText: string;
  sourcesByCollection?: Record<string, unknown>;
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
        ...config.extraParams,
      };

      const { fetch: configFetch } = useChatConfigStore.getState();
      const response = await configFetch('/api/chat-service/notebook/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
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
            case 'text_delta': {
              accumulatedText += (data as { text: string }).text;
              yield {
                content: [{ type: 'text' as const, text: accumulatedText }],
              };
              break;
            }

            case 'completion': {
              completionData = data as StreamCompletionData;
              break;
            }

            case 'error': {
              const { error } = data as { error: string };
              throw new Error(error);
            }
          }
        }
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

        const metadata: NotebookMessageMetadata = {
          citations,
          sources,
          additionalSources,
          linkConfig,
          question,
          resultId,
          answerText: completionData.answer,
          ...(sourcesByCollection && { sourcesByCollection }),
        };

        yield {
          content: [{ type: 'text' as const, text: completionData.answer }],
          metadata: { custom: metadata },
        };

        callbacks.onComplete?.(metadata);
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
