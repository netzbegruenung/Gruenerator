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
  ProgressStep,
} from '../hooks/useChatGraphStream';
import type { ToolKey, ThreadMode, SearchMode } from '../stores/chatStore';
import { parseAllMentions } from '../lib/mentionParser';
import { parseSSELine } from '../lib/sseParser';
import { INTENT_TO_TOOL, DEEP_TOOL_MAP } from '../lib/toolMappings';
import { useDocumentChatStore } from '../stores/documentChatStore';

export type GrueneratorMessageMetadata = {
  progress?: ChatProgress;
  searchResults?: SearchResult[];
  citations?: Citation[];
  generatedImage?: GeneratedImage;
  streamMetadata?: StreamMetadata;
  threadId?: string;
  followUpSuggestions?: string[];
  [key: string]: unknown;
};

export interface GrueneratorAdapterConfig {
  agentId: string | null;
  modelId: string;
  enabledTools: Record<ToolKey, boolean>;
  threadId: string | null;
  useDeepAgent?: boolean;
  selectedNotebookId?: string;
  threadMode?: ThreadMode;
  searchMode?: SearchMode;
}

export interface GrueneratorAdapterCallbacks {
  onThreadCreated?: (threadId: string) => void;
  onComplete?: (metadata: StreamMetadata) => void;
}

interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: Record<string, string | number | boolean | null>;
  result?: unknown;
}

interface SourcePart {
  type: 'source';
  sourceType: 'url';
  id: string;
  url: string;
  title?: string;
  parentId?: string;
}

interface StreamOutcome {
  interrupted: boolean;
  lastResult?: ChatModelRunResult;
  indexedDocumentIds: string[];
}

async function* parseSSEStream(
  response: Response,
  callbacks: GrueneratorAdapterCallbacks,
  outcome: StreamOutcome
): AsyncGenerator<ChatModelRunResult, void> {
  const reader = response.body?.getReader();

  // React Native's fetch doesn't support ReadableStream — read full text as fallback
  const fullText = !reader ? await response.text() : null;

  const decoder = new TextDecoder();
  let buffer = '';
  const currentEvent = { type: '' };
  let accumulatedText = '';
  let currentProgress: ChatProgress = {
    stage: 'classifying',
    message: 'Analysiere Anfrage...',
  };
  const progressSteps: ProgressStep[] = [
    { stage: 'classifying', label: 'Klassifizierung', status: 'in-progress' },
  ];

  const STAGE_LABELS: Record<string, string> = {
    classifying: 'Klassifizierung',
    searching: 'Suche',
    summarizing: 'Zusammenfassung',
    generating_image: 'Bildgenerierung',
    generating: 'Generierung',
  };

  function transitionStep(newStage: ProgressStage, labelOverride?: string) {
    // Mark current in-progress step as completed
    for (const step of progressSteps) {
      if (step.status === 'in-progress') {
        step.status = 'completed';
        step.completedAt = Date.now();
      }
    }
    // Add new step if it has a label and isn't 'complete'/'error'/'idle'
    const label = labelOverride || STAGE_LABELS[newStage];
    if (label && newStage !== 'complete' && newStage !== 'error' && newStage !== 'idle') {
      // Don't duplicate if the same stage already exists
      if (!progressSteps.some((s) => s.stage === newStage)) {
        progressSteps.push({ stage: newStage, label, status: 'in-progress' });
      } else {
        // Re-activate existing step
        const existing = progressSteps.find((s) => s.stage === newStage);
        if (existing) existing.status = 'in-progress';
      }
    }
    if (newStage === 'complete') {
      for (const step of progressSteps) {
        if (step.status !== 'failed') {
          step.status = 'completed';
          step.completedAt ??= Date.now();
        }
      }
    }
    if (newStage === 'error') {
      for (const step of progressSteps) {
        if (step.status === 'in-progress') {
          step.status = 'failed';
        }
      }
    }
  }

  let receivedSearchResults: SearchResult[] = [];
  let receivedCitations: Citation[] = [];
  let receivedImage: GeneratedImage | null = null;
  let receivedFollowUpSuggestions: string[] = [];
  let receivedMetadata: StreamMetadata | null = null;
  let activeToolCall: ToolCallPart | null = null;
  const allToolCalls: ToolCallPart[] = [];
  let interruptPending = false;

  function buildResult(): ChatModelRunResult {
    const content: Array<{ type: 'text'; text: string } | ToolCallPart | SourcePart> = [];

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
      progress: { ...currentProgress, steps: [...progressSteps] },
    };
    if (receivedSearchResults.length > 0) custom.searchResults = receivedSearchResults;
    if (receivedCitations.length > 0) custom.citations = receivedCitations;
    if (receivedImage) custom.generatedImage = receivedImage;
    if (receivedMetadata) custom.streamMetadata = receivedMetadata;
    if (receivedFollowUpSuggestions.length > 0)
      custom.followUpSuggestions = receivedFollowUpSuggestions;

    const isInterrupted = interruptPending && currentProgress.stage === 'complete';

    return {
      content,
      metadata: { custom },
      ...(isInterrupted
        ? { status: { type: 'requires-action' as const, reason: 'tool-calls' as const } }
        : {}),
    };
  }

  // Feed chunks: stream from reader, or single chunk from full text fallback
  const chunks: AsyncIterable<Uint8Array> = reader
    ? {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            const { done, value } = await reader.read();
            return done
              ? { done: true as const, value: undefined }
              : { done: false as const, value };
          },
        }),
      }
    : (async function* () {
        yield new TextEncoder().encode(fullText!);
      })();

  for await (const value of chunks) {
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
          const { intent, message, reasoning, searchQuery, subQueries, searchSources } = data as {
            intent: SearchIntent;
            message: string;
            reasoning?: string;
            searchQuery?: string;
            subQueries?: string[] | null;
            searchSources?: string[] | null;
          };
          let stage: ProgressStage = 'searching';
          if (intent === 'direct') stage = 'generating';
          else if (intent === 'image') stage = 'generating_image';
          else if (intent === 'summary') stage = 'summarizing';
          transitionStep(stage);
          currentProgress = { stage, message, intent, reasoning };

          const toolName = INTENT_TO_TOOL[intent];
          if (toolName) {
            const hasMultiSearch =
              (subQueries && subQueries.length > 0) || (searchSources && searchSources.length > 1);

            if (hasMultiSearch) {
              const queries = subQueries?.length ? subQueries : [searchQuery || message];
              const sources =
                searchSources?.length && searchSources.length > 1 ? searchSources : [null];

              for (let i = 0; i < queries.length; i++) {
                for (const src of sources) {
                  const effToolName =
                    src === 'web'
                      ? 'web_search'
                      : src === 'documents'
                        ? 'gruenerator_search'
                        : toolName;
                  allToolCalls.push({
                    type: 'tool-call',
                    toolCallId: `tc_${Date.now()}_${i}_${src || 'default'}`,
                    toolName: effToolName,
                    args: { query: queries[i] },
                    argsText: JSON.stringify({ query: queries[i] }),
                  });
                }
              }
              activeToolCall = null;
              console.debug('[ToolCall] Created multi-search:', allToolCalls.length, 'tool calls');
            } else {
              const toolArgs = { query: searchQuery || message };
              activeToolCall = {
                type: 'tool-call',
                toolCallId: `tc_${Date.now()}`,
                toolName,
                args: toolArgs,
                argsText: JSON.stringify(toolArgs),
              };
              console.debug('[ToolCall] Created:', toolName, 'query:', toolArgs.query.slice(0, 60));
            }
          } else if (intent !== 'direct' && intent !== 'image') {
            console.debug('[ToolCall] No tool mapping for intent:', intent);
          }
          yield buildResult();
          break;
        }

        case 'search_start': {
          const { message } = data as { message: string };
          transitionStep('searching');
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
          // Update searching step label with result count
          const searchStep = progressSteps.find((s) => s.stage === 'searching');
          if (searchStep) {
            searchStep.label = `${resultCount} Ergebnisse`;
            searchStep.status = 'completed';
            searchStep.completedAt = Date.now();
          }
          transitionStep('generating', 'Generiere Antwort');
          currentProgress = {
            ...currentProgress,
            stage: 'generating',
            message,
            resultCount,
          };

          // Mark all pending multi-search tool calls as complete
          for (let i = 0; i < allToolCalls.length; i++) {
            if (!allToolCalls[i].result) {
              allToolCalls[i] = { ...allToolCalls[i], result: { results: results || [] } };
            }
          }
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

        case 'summary_start': {
          const { message } = data as { message: string };
          transitionStep('summarizing');
          currentProgress = { ...currentProgress, stage: 'summarizing', message };
          yield buildResult();
          break;
        }

        case 'summary_complete': {
          const { message } = data as { message: string };
          transitionStep('generating', 'Generiere Antwort');
          currentProgress = { ...currentProgress, stage: 'generating', message };
          yield buildResult();
          break;
        }

        case 'image_start': {
          const { message } = data as { message: string };
          transitionStep('generating_image');
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
          transitionStep(imageError ? 'error' : 'generating');
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
          transitionStep('generating', 'Generiere Antwort');
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
          const delta = (data as { text: string }).text;
          accumulatedText += delta;
          if (accumulatedText.length <= 20 || accumulatedText.length % 200 === 0) {
            console.debug(
              `[SSE] text_delta: +${delta.length} chars, total=${accumulatedText.length}`
            );
          }
          yield buildResult();
          break;
        }

        case 'interrupt': {
          console.debug('[SSE] interrupt event received — will set requires-action status');
          interruptPending = true;
          yield buildResult();
          break;
        }

        case 'done': {
          const {
            citations: cit,
            generatedImage: img,
            metadata,
            interrupted,
          } = data as {
            threadId?: string;
            citations?: Citation[];
            generatedImage?: GeneratedImage;
            metadata?: StreamMetadata;
            interrupted?: boolean;
          };
          if (cit) receivedCitations = cit;
          if (img) receivedImage = img;
          if (metadata) receivedMetadata = metadata;
          if (interrupted) interruptPending = true;
          transitionStep('complete');
          currentProgress = { stage: 'complete', message: '' };
          break;
        }

        case 'document_indexed': {
          const { documentId } = data as { documentId: string };
          outcome.indexedDocumentIds.push(documentId);
          break;
        }

        // ── Search mode events ──
        case 'sources_preview': {
          console.debug(`[SSE] sources_preview: ${(data as any)?.results?.length || 0} results`);
          const { results: previewResults, resultCount } = data as {
            results?: SearchResult[];
            resultCount?: number;
          };
          if (previewResults) {
            receivedSearchResults = previewResults;
            // Create synthetic search_sources tool call for sources-first rendering
            const sourcesToolCall: ToolCallPart = {
              type: 'tool-call',
              toolCallId: `tc_sources_${Date.now()}`,
              toolName: 'search_sources',
              argsText: '{}',
              args: {},
              result: {
                results: previewResults,
                resultCount: resultCount || previewResults.length,
              },
            };
            allToolCalls.push(sourcesToolCall);
          }
          transitionStep('generating', 'Generierung');
          break;
        }

        case 'suggestions': {
          const { suggestions: sugg } = data as { suggestions?: string[] };
          if (sugg) {
            receivedFollowUpSuggestions = sugg;
          }
          break;
        }

        case 'research_step': {
          const { step, message } = data as { step: string; message: string };
          transitionStep(step as ProgressStage, message);
          currentProgress = { stage: step as ProgressStage, message };
          break;
        }

        // ── Notebook mode events ──
        case 'completion': {
          const completionData = data as {
            text?: string;
            citations?: Array<{
              index: string;
              cited_text?: string;
              document_title?: string;
              document_id?: string;
              source_url?: string | null;
              similarity_score?: number;
              chunk_index?: number;
              collection_id?: string;
              collection_name?: string;
            }>;
          };
          if (completionData.text) {
            // Normalize [cite:N] markers to [N]
            accumulatedText = completionData.text.replace(/\[cite:(\d+)\]/g, '[$1]');
          }
          if (completionData.citations) {
            receivedCitations = completionData.citations.map((c) => ({
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
          transitionStep('complete');
          currentProgress = { stage: 'complete', message: '' };
          break;
        }

        case 'error': {
          const { error } = data as { error: string };
          transitionStep('error');
          throw new Error(error);
        }
      }
    }
  }

  const finalResult = buildResult();
  outcome.lastResult = finalResult;
  yield finalResult;

  outcome.interrupted = interruptPending;

  if (receivedMetadata && !interruptPending) {
    console.debug('[SSE] Stream complete — calling onComplete');
    callbacks.onComplete?.(receivedMetadata);
  } else {
    console.debug(
      '[SSE] Stream complete — onComplete skipped (metadata=%s, interrupt=%s)',
      !!receivedMetadata,
      interruptPending
    );
  }
}

export function createGrueneratorModelAdapter(
  getConfig: () => GrueneratorAdapterConfig,
  callbacks: GrueneratorAdapterCallbacks
): ChatModelAdapter {
  // Tracks which thread has a pending HITL interrupt — persists across run() calls
  let interruptedThreadId: string | null = null;
  let lastInterruptedResult: ChatModelRunResult | null = null;

  return {
    async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const { messages, abortSignal } = options;
      const config = getConfig();
      const runId = `run_${Date.now()}`;

      // unstable_getMessage() provides the current assistant message (not in messages array).
      // This is where addResult() writes the user's answer for human tool calls.
      const currentAssistant = options.unstable_getMessage?.();
      const askHumanInCurrent = currentAssistant?.content?.filter(
        (p) => p.type === 'tool-call' && p.toolName === 'ask_human'
      );
      console.debug(
        `[ModelAdapter:${runId}] run() called — msgs=${messages.length}, threadId=${config.threadId}, interruptedThread=${interruptedThreadId}, currentAssistant=${currentAssistant ? 'yes' : 'no'}, askHumanInCurrent=${askHumanInCurrent?.length ?? 0}`,
        askHumanInCurrent?.map((p) => ({
          toolCallId: p.type === 'tool-call' ? p.toolCallId : '?',
          hasResult: 'result' in p,
          resultType: 'result' in p ? typeof p.result : 'none',
          resultPreview:
            'result' in p && typeof p.result === 'string' ? String(p.result).slice(0, 50) : null,
        }))
      );

      // Resume detection via unstable_getMessage() — the canonical way to read addResult() answers.
      // assistant-ui writes the result onto the current assistant message, NOT into messages[].
      if (currentAssistant) {
        const askHumanResult = currentAssistant.content?.find(
          (p) =>
            p.type === 'tool-call' &&
            p.toolName === 'ask_human' &&
            'result' in p &&
            typeof p.result === 'string' &&
            (p.result as string).length > 0
        );
        if (askHumanResult && askHumanResult.type === 'tool-call') {
          const answer = String(askHumanResult.result);
          console.debug(
            `[ModelAdapter:${runId}] Resuming via unstable_getMessage — answer="${answer.slice(0, 80)}"`
          );
          interruptedThreadId = null;
          lastInterruptedResult = null;
          const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
          const resumeResponse = await configFetch(endpoints.chatResume, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              threadId: config.threadId,
              resume: answer,
            }),
            signal: abortSignal,
          });

          if (!resumeResponse.ok) {
            const errorData = await resumeResponse.json().catch(() => ({}));
            throw new Error(
              (errorData as { error?: string }).error || `HTTP error ${resumeResponse.status}`
            );
          }

          const resumeOutcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
          yield* parseSSEStream(resumeResponse, callbacks, resumeOutcome);
          if (resumeOutcome.interrupted) {
            interruptedThreadId = config.threadId;
            lastInterruptedResult = resumeOutcome.lastResult ?? null;
          }
          return;
        }

        // Current assistant has pending ask_human without result — spurious re-invocation.
        const pendingAskHuman = currentAssistant.content?.find(
          (p) =>
            p.type === 'tool-call' && p.toolName === 'ask_human' && !('result' in p && p.result)
        );
        if (pendingAskHuman) {
          console.debug(
            `[ModelAdapter:${runId}] BLOCKED — pending ask_human in currentAssistant without answer`
          );
          throw new DOMException('Aborted', 'AbortError');
        }
      }

      // Stateful guard: block re-invocation if we know this thread has a pending interrupt
      // (covers case where unstable_getMessage returns undefined after history rehydration)
      if (interruptedThreadId && interruptedThreadId === config.threadId) {
        console.debug(
          `[ModelAdapter:${runId}] BLOCKED — interruptedThreadId=${interruptedThreadId}, throwing AbortError`
        );
        throw new DOMException('Aborted', 'AbortError');
      }

      // Clear stale interrupt if switching to a different thread
      if (interruptedThreadId && interruptedThreadId !== config.threadId) {
        console.debug(
          `[ModelAdapter:${runId}] Clearing stale interrupt for thread ${interruptedThreadId}`
        );
        interruptedThreadId = null;
        lastInterruptedResult = null;
      }

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

        // Merge attachment content parts into formattedMessages so the backend
        // can also see them when inspecting the messages array directly.
        if (m.role === 'user' && 'attachments' in m) {
          for (const att of (m as any).attachments) {
            for (const part of att.content) {
              if (part.type === 'text') {
                parts.push({ type: 'text', text: part.text });
              } else if (part.type === 'image') {
                parts.push({ type: 'image', image: part.image });
              } else if (part.type === 'file') {
                parts.push({
                  type: 'file',
                  name: att.name ?? 'file',
                  mimeType: part.mimeType ?? 'application/octet-stream',
                  data: part.data ?? '',
                });
              }
            }
          }
        }

        if (parts.length === 0) {
          parts.push({ type: 'text', text: '' });
        }

        return { id: m.id, role: m.role, parts };
      });

      // Skip attachment extraction and mention parsing for non-chat modes
      const isChatMode = !config.threadMode || config.threadMode === 'chat';

      // Extract attachments from AUI's CompleteAttachment objects on the last user message.
      // AUI stores file/image content in message.attachments[].content, NOT in message.content.
      const extractedAttachments: Array<{
        name: string;
        type: string;
        size: number;
        data: string;
        isImage: boolean;
      }> = [];

      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (isChatMode && lastUserMsg && 'attachments' in lastUserMsg) {
        for (const attachment of lastUserMsg.attachments as unknown as Array<{
          name?: string;
          contentType?: string;
          content: Array<
            | { type: 'file'; data: string; mimeType: string }
            | { type: 'image'; image: string }
            | { type: string }
          >;
        }>) {
          for (const part of attachment.content) {
            if (part.type === 'file' && 'data' in part) {
              extractedAttachments.push({
                name: attachment.name || 'file',
                type: (part as { mimeType: string }).mimeType,
                size: Math.ceil(((part as { data: string }).data.length * 3) / 4),
                data: (part as { data: string }).data,
                isImage: false,
              });
            } else if (part.type === 'image' && 'image' in part) {
              const imageData = (part as { image: string }).image;
              const commaIdx = imageData.indexOf(',');
              const header = commaIdx > 0 ? imageData.slice(0, commaIdx) : '';
              const base64Data = commaIdx > 0 ? imageData.slice(commaIdx + 1) : imageData;
              const mimeMatch = header.match(/data:(.*?);/);
              extractedAttachments.push({
                name: attachment.name || 'image',
                type: mimeMatch?.[1] || 'image/jpeg',
                size: Math.ceil((base64Data.length * 3) / 4),
                data: base64Data,
                isImage: true,
              });
            }
          }
        }
      }

      if (extractedAttachments.length > 0) {
        console.debug(
          `[ModelAdapter:${runId}] Extracted ${extractedAttachments.length} attachment(s):`,
          extractedAttachments.map((a) => ({
            name: a.name,
            type: a.type,
            size: a.size,
            isImage: a.isImage,
          }))
        );
      }

      // Extract @-mentions from the last user message for agent routing + notebook/document scoping
      // Only applies in chat mode — search and notebook modes don't use mentions
      let effectiveAgentId = config.agentId;
      let notebookIds: string[] = [];
      let forcedTools: string[] = [];
      let documentIds: string[] = [];
      let textIds: string[] = [];
      let boardIds: string[] = [];
      let docMentionIds: string[] = [];
      let hasDocumentChat = false;
      if (isChatMode)
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
            documentIds = parsed.documentIds;
            textIds = parsed.textIds;
            boardIds = parsed.boardIds;
            docMentionIds = parsed.docMentionIds;
            hasDocumentChat = parsed.hasDocumentChat;
            textPart.text = parsed.cleanText;
            console.debug(
              `[ModelAdapter:${runId}] Mentions parsed — forcedTools=${JSON.stringify(forcedTools)}, agentId=${effectiveAgentId}, cleanText="${parsed.cleanText.slice(0, 60)}"`
            );
          }
          break;
        }

      // Read thread-persisted documentChatIds for follow-up messages
      const dcStore = useDocumentChatStore.getState();
      const documentChatIds = dcStore.getForThread(config.threadId);

      const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
      const threadMode = config.threadMode || 'chat';

      // Mode-aware endpoint selection
      const endpoint =
        threadMode === 'search'
          ? endpoints.searchStream
          : threadMode === 'notebook'
            ? endpoints.notebookStream
            : config.useDeepAgent
              ? endpoints.deepStream
              : endpoints.chatStream;

      // Mode-aware request body
      let requestBody: Record<string, unknown>;

      if (threadMode === 'search') {
        // Search mode: simple query + searchMode, no mentions/attachments
        const lastUserText = formattedMessages
          .filter((m) => m.role === 'user')
          .pop()
          ?.parts?.find((p: { type: string }) => p.type === 'text') as { text: string } | undefined;
        requestBody = {
          query: lastUserText?.text || '',
          messages: formattedMessages,
          threadId: config.threadId,
          searchMode: config.searchMode || 'web',
        };
      } else if (threadMode === 'notebook') {
        // Notebook mode: query + collection scoping from selectedNotebookId
        const lastUserText = formattedMessages
          .filter((m) => m.role === 'user')
          .pop()
          ?.parts?.find((p: { type: string }) => p.type === 'text') as { text: string } | undefined;
        requestBody = {
          query: lastUserText?.text || '',
          notebookId: config.selectedNotebookId || 'gruenerator-notebook',
          threadId: config.threadId,
        };
      } else {
        // Chat mode: full request with mentions, attachments, tools
        requestBody = {
          messages: formattedMessages,
          agentId: effectiveAgentId,
          threadId: config.threadId,
          enabledTools: config.enabledTools,
          modelId: config.modelId,
          attachments: extractedAttachments.length > 0 ? extractedAttachments : undefined,
          notebookIds: notebookIds.length > 0 ? notebookIds : undefined,
          forcedTools: forcedTools.length > 0 ? forcedTools : undefined,
          documentIds: documentIds.length > 0 ? documentIds : undefined,
          textIds: textIds.length > 0 ? textIds : undefined,
          boardIds: boardIds.length > 0 ? boardIds : undefined,
          docMentionIds: docMentionIds.length > 0 ? docMentionIds : undefined,
          documentChatIds: documentChatIds.length > 0 ? documentChatIds : undefined,
          documentChatMode: hasDocumentChat || documentChatIds.length > 0 || undefined,
          defaultNotebookId: config.selectedNotebookId || undefined,
        };
      }

      console.debug(
        `[ModelAdapter:${runId}] Sending stream request → ${endpoint}, threadId=${config.threadId}, mode=${threadMode}`
      );
      const response = await configFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || `HTTP error ${response.status}`);
      }

      const streamOutcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
      yield* parseSSEStream(response, callbacks, streamOutcome);

      // Persist server-indexed document IDs to thread for follow-up messages
      if (streamOutcome.indexedDocumentIds.length > 0 && config.threadId) {
        for (const docId of streamOutcome.indexedDocumentIds) {
          dcStore.addToThread(config.threadId, docId);
        }
      }

      if (streamOutcome.interrupted) {
        interruptedThreadId = config.threadId;
        lastInterruptedResult = streamOutcome.lastResult ?? null;
        console.debug(
          `[ModelAdapter:${runId}] Stream interrupted — set interruptedThreadId=${config.threadId}, hasStoredResult=${!!lastInterruptedResult}`
        );
      }
    },
  };
}
