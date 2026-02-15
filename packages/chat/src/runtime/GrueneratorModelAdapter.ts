import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';
import { useChatConfigStore } from '../stores/chatConfigStore';
import type {
  ProgressStage,
  SearchIntent,
  GeneratedImage,
  ChatProgress,
  Citation,
  SearchResult,
  StreamMetadata,
} from '../hooks/useChatGraphStream';
import type { ToolKey } from '../stores/chatStore';
import { parseAllMentions } from '../lib/mentionParser';

export type GrueneratorMessageMetadata = {
  progress?: ChatProgress;
  searchResults?: SearchResult[];
  citations?: Citation[];
  generatedImage?: GeneratedImage;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  [key: string]: unknown;
};

export interface GrueneratorAdapterConfig {
  agentId: string | null;
  modelId: string;
  enabledTools: Record<ToolKey, boolean>;
  threadId: string | null;
  useDeepAgent?: boolean;
}

export interface GrueneratorAdapterCallbacks {
  onThreadCreated?: (threadId: string) => void;
  onComplete?: (metadata: StreamMetadata) => void;
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

export function createGrueneratorModelAdapter(
  getConfig: () => GrueneratorAdapterConfig,
  callbacks: GrueneratorAdapterCallbacks
): ChatModelAdapter {
  return {
    async *run({
      messages,
      abortSignal,
    }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const config = getConfig();

      const formattedMessages = messages.map((m) => {
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'image'; image: string }
          | { type: 'file'; name: string; mimeType: string; data: string }
        > = [];

        for (const part of m.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', text: part.text });
          } else if (part.type === 'image') {
            parts.push({ type: 'image', image: part.image });
          } else if (part.type === 'file') {
            parts.push({
              type: 'file',
              name: (part as { name?: string }).name ?? 'file',
              mimeType: (part as { mimeType?: string }).mimeType ?? 'application/octet-stream',
              data: (part as { data?: string }).data ?? '',
            });
          }
        }

        if (parts.length === 0) {
          parts.push({ type: 'text', text: '' });
        }

        return { id: m.id, role: m.role, parts };
      });

      // Extract @-mentions from the last user message for agent routing + notebook scoping
      let effectiveAgentId = config.agentId;
      let notebookIds: string[] = [];
      let forcedTools: string[] = [];
      for (let i = formattedMessages.length - 1; i >= 0; i--) {
        const msg = formattedMessages[i];
        if (msg.role !== 'user') continue;
        const textPart = msg.parts.find(
          (p): p is { type: 'text'; text: string } => p.type === 'text'
        );
        if (textPart) {
          const parsed = parseAllMentions(textPart.text);
          effectiveAgentId = parsed.agentId;
          notebookIds = parsed.notebookIds;
          forcedTools = parsed.forcedTools;
          textPart.text = parsed.cleanText;
        }
        break;
      }

      const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
      const endpoint = config.useDeepAgent ? endpoints.deepStream : endpoints.chatStream;
      const response = await configFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formattedMessages,
          agentId: effectiveAgentId,
          threadId: config.threadId,
          enabledTools: config.enabledTools,
          modelId: config.modelId,
          notebookIds: notebookIds.length > 0 ? notebookIds : undefined,
          forcedTools: forcedTools.length > 0 ? forcedTools : undefined,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || `HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const INTENT_TO_TOOL: Record<string, string> = {
        search: 'gruenerator_search',
        web: 'web_search',
        research: 'research',
        examples: 'gruenerator_examples_search',
      };

      interface ToolCallPart {
        type: 'tool-call';
        toolCallId: string;
        toolName: string;
        argsText: string;
        args: Record<string, string | number | boolean | null>;
        result?: unknown;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const currentEvent = { type: '' };
      let accumulatedText = '';
      let currentProgress: ChatProgress = {
        stage: 'classifying',
        message: 'Analysiere Anfrage...',
      };
      let receivedSearchResults: SearchResult[] = [];
      let receivedCitations: Citation[] = [];
      let receivedImage: GeneratedImage | null = null;
      let receivedMetadata: StreamMetadata | null = null;
      let activeToolCall: ToolCallPart | null = null;
      const allToolCalls: ToolCallPart[] = [];

      /** Deep agent tool name → Assistant UI tool name mapping */
      const DEEP_TOOL_MAP: Record<string, string> = {
        search_documents: 'gruenerator_search',
        web_search: 'web_search',
        research: 'research',
        search_examples: 'gruenerator_examples_search',
        generate_image: 'generate_image',
        scrape_url: 'scrape_url',
        recall_memory: 'recall_memory',
        save_memory: 'save_memory',
      };

      interface SourcePart {
        type: 'source';
        sourceType: 'url';
        id: string;
        url: string;
        title?: string;
        parentId?: string;
      }

      function buildResult(): ChatModelRunResult {
        const content: Array<{ type: 'text'; text: string } | ToolCallPart | SourcePart> = [];

        // Include all completed tool calls + the active one
        const groupId = activeToolCall ? activeToolCall.toolCallId : allToolCalls[0]?.toolCallId;

        for (const tc of allToolCalls) {
          content.push(tc);
        }
        if (activeToolCall && !allToolCalls.includes(activeToolCall)) {
          content.push(activeToolCall);
        }

        for (const citation of receivedCitations) {
          if (citation.url) {
            content.push({
              type: 'source' as const,
              sourceType: 'url' as const,
              id: `source-${citation.id}`,
              url: citation.url,
              title: citation.title || undefined,
              parentId: groupId,
            });
          }
        }

        content.push({ type: 'text' as const, text: accumulatedText });

        const custom: GrueneratorMessageMetadata = {
          progress: currentProgress,
        };
        if (receivedSearchResults.length > 0) custom.searchResults = receivedSearchResults;
        if (receivedCitations.length > 0) custom.citations = receivedCitations;
        if (receivedImage) custom.generatedImage = receivedImage;
        if (receivedMetadata) custom.streamMetadata = receivedMetadata;

        return {
          content,
          metadata: { custom },
        };
      }

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
              const { threadId: tid } = data as { threadId: string };
              callbacks.onThreadCreated?.(tid);
              break;
            }

            case 'intent': {
              const { intent, message, reasoning, searchQuery } = data as {
                intent: SearchIntent;
                message: string;
                reasoning?: string;
                searchQuery?: string;
              };
              let stage: ProgressStage = 'searching';
              if (intent === 'direct') stage = 'generating';
              else if (intent === 'image') stage = 'generating_image';
              currentProgress = { stage, message, intent, reasoning };

              const toolName = INTENT_TO_TOOL[intent];
              if (toolName) {
                const toolArgs = { query: searchQuery || message };
                activeToolCall = {
                  type: 'tool-call',
                  toolCallId: `tc_${Date.now()}`,
                  toolName,
                  args: toolArgs,
                  argsText: JSON.stringify(toolArgs),
                };
                console.debug(
                  '[ToolCall] Created:',
                  toolName,
                  'query:',
                  toolArgs.query.slice(0, 60)
                );
              } else if (intent !== 'direct' && intent !== 'image') {
                console.debug('[ToolCall] No tool mapping for intent:', intent);
              }
              yield buildResult();
              break;
            }

            case 'search_start': {
              const { message } = data as { message: string };
              currentProgress = { ...currentProgress, stage: 'searching', message };
              yield buildResult();
              break;
            }

            case 'search_complete': {
              const { message, resultCount, results } = data as {
                message: string;
                resultCount: number;
                results?: SearchResult[];
              };
              if (results) receivedSearchResults = results;
              currentProgress = {
                ...currentProgress,
                stage: 'generating',
                message,
                resultCount,
              };

              if (activeToolCall) {
                activeToolCall = Object.assign({}, activeToolCall, {
                  result: { results: results || [] },
                });
                console.debug(
                  '[ToolCall] Result set:',
                  activeToolCall.toolName,
                  'results:',
                  (results || []).length
                );
              }
              yield buildResult();
              break;
            }

            case 'image_start': {
              const { message } = data as { message: string };
              currentProgress = { ...currentProgress, stage: 'generating_image', message };
              yield buildResult();
              break;
            }

            case 'image_complete': {
              const {
                message,
                image,
                error: imageError,
              } = data as {
                message: string;
                image?: GeneratedImage;
                error?: string;
              };
              if (image) receivedImage = image;
              currentProgress = {
                ...currentProgress,
                stage: imageError ? 'error' : 'generating',
                message,
              };
              yield buildResult();
              break;
            }

            case 'response_start': {
              const { message } = data as { message: string };
              currentProgress = { ...currentProgress, stage: 'generating', message };
              yield buildResult();
              break;
            }

            case 'thinking_step': {
              const { stepId, toolName, title, status, args, result } = data as {
                stepId: string;
                toolName: string;
                title: string;
                status: 'in_progress' | 'completed';
                args?: Record<string, unknown>;
                result?: {
                  resultCount?: number;
                  results?: unknown[];
                  image?: unknown;
                  error?: string;
                };
              };

              const mappedToolName = DEEP_TOOL_MAP[toolName] || toolName;

              if (status === 'in_progress') {
                const toolArgs = { query: (args?.query as string) || title, ...args };
                activeToolCall = {
                  type: 'tool-call',
                  toolCallId: stepId,
                  toolName: mappedToolName,
                  args: toolArgs as Record<string, string | number | boolean | null>,
                  argsText: JSON.stringify(toolArgs),
                };
                currentProgress = { stage: 'searching', message: title };
              } else if (status === 'completed') {
                if (activeToolCall?.toolCallId === stepId) {
                  activeToolCall = { ...activeToolCall, result: result || {} };
                  allToolCalls.push(activeToolCall);
                  activeToolCall = null;
                }
                currentProgress = { stage: 'generating', message: title };
              }
              yield buildResult();
              break;
            }

            case 'text_delta': {
              accumulatedText += (data as { text: string }).text;
              yield buildResult();
              break;
            }

            case 'done': {
              const {
                citations: cit,
                generatedImage: img,
                metadata,
              } = data as {
                threadId?: string;
                citations?: Citation[];
                generatedImage?: GeneratedImage;
                metadata?: StreamMetadata;
              };
              if (cit) receivedCitations = cit;
              if (img) receivedImage = img;
              if (metadata) receivedMetadata = metadata;
              currentProgress = { stage: 'complete', message: '' };
              break;
            }

            case 'error': {
              const { error } = data as { error: string };
              throw new Error(error);
            }
          }
        }

      }

      // Final yield with all accumulated data
      yield buildResult();

      if (receivedMetadata) {
        callbacks.onComplete?.(receivedMetadata);
      }
    },
  };
}
