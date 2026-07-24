import {
  triggerDocEditSchema,
  triggerBoardActionSchema,
  editorOperationsEventSchema,
  isCanvasTemplateType,
  chatStreamEventSchemas,
  type ChatErrorEventPayload,
} from '@gruenerator/contracts';

import { coerceSharepicVariants } from '../../hooks/useChatGraphStream';
import { ChatStreamError } from '../streamErrorMessage';
import { parseSSELine } from '../../lib/sseParser';
import { INTENT_TO_TOOL, DEEP_TOOL_MAP, formatNamespacedToolLabel } from '../../lib/toolMappings';
import { pickStageLabels } from '../../lib/progressLabels';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useAgentStore } from '../../stores/chatStore';
import { useArtifactLiveStore, type ActiveArtifact } from '../../stores/artifactLiveStore';
import { useReelLiveStore } from '../../stores/reelLiveStore';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../../stores/socialPostLiveStore';

import type {
  GrueneratorAdapterCallbacks,
  GrueneratorMessageMetadata,
  ToolCallPart,
  SourcePart,
  StreamOutcome,
} from './types';
import type { ChatModelRunResult } from '@assistant-ui/react';
import type {
  ProgressStage,
  SearchIntent,
  GeneratedImage,
  ChatProgress,
  Citation,
  FallbackInfo,
  SearchResult,
  StreamMetadata,
  ProgressStep,
  ChartData,
  ComputeData,
} from '../../hooks/useChatGraphStream';
import type {
  ConfirmActionData,
  DocumentCreatedData,
  ReelPickerData,
  ReelProcessingData,
} from '../../types/messageMetadata';

/** Display titles for agentic sharepic-loop steps (tool_step_start events). */
const TOOL_STEP_TITLES: Record<string, string> = {
  read_sharepic_state: 'Lese aktuellen Zustand…',
  apply_sharepic_ops: 'Wende Änderung an…',
  restore_version: 'Stelle Version wieder her…',
};

export async function* parseSSEStream(
  response: Response,
  callbacks: GrueneratorAdapterCallbacks,
  outcome: StreamOutcome,
  agentInfo?: { agentId: string; agentMention?: string },
  // Tool-call parts from an earlier stream of the SAME run (client-tool
  // resume): pre-seeded so the run_python card stays visible while the
  // resumed answer streams.
  carryOver?: { toolCalls: ToolCallPart[] }
): AsyncGenerator<ChatModelRunResult, void> {
  const reader = response.body?.getReader();

  // React Native's fetch doesn't support ReadableStream — read full text as fallback
  const fullText = !reader ? await response.text() : null;

  const decoder = new TextDecoder();
  let buffer = '';
  const currentEvent = { type: '' };
  let accumulatedText = '';
  let accumulatedReasoning = '';
  // Themed progress labels — picked once per turn, stable for the whole stream.
  const stageLabels = pickStageLabels();
  let currentProgress: ChatProgress = {
    stage: 'classifying',
    message: stageLabels.classifying,
  };
  const progressSteps: ProgressStep[] = [
    { stage: 'classifying', label: stageLabels.classifying, status: 'in-progress' },
  ];

  function transitionStep(newStage: ProgressStage, labelOverride?: string) {
    // Mark current in-progress step as completed
    for (const step of progressSteps) {
      if (step.status === 'in-progress') {
        step.status = 'completed';
        step.completedAt = Date.now();
      }
    }
    // Add new step if it has a label and isn't 'complete'/'error'/'idle'
    const label = labelOverride || stageLabels[newStage];
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
  let receivedSharepicData: import('../../hooks/useChatGraphStream').SharepicData | null = null;
  let receivedSocialPostData: import('@gruenerator/contracts').SocialPostPayload | null = null;
  let receivedChartData: ChartData | null = null;
  let receivedArtifactData: ActiveArtifact | null = null;
  let receivedComputeData: ComputeData | null = null;
  let receivedBundestagData: import('@gruenerator/contracts').BundestagPayload | null = null;
  let receivedBahnData: import('@gruenerator/contracts').BahnPayload | null = null;
  let receivedFollowUpSuggestions: string[] = [];
  let receivedMetadata: StreamMetadata | null = null;
  let receivedConfirmAction: ConfirmActionData | null = null;
  let receivedCreatedDocument: DocumentCreatedData | null = null;
  let receivedReelProcessing: ReelProcessingData | null = null;
  let receivedReelPicker: ReelPickerData | null = null;
  let activeToolCall: ToolCallPart | null = null;
  const allToolCalls: ToolCallPart[] = [...(carryOver?.toolCalls ?? [])];
  // Agentic tool-loop steps, keyed by stepId. The loop can run several tools in
  // ONE model step (parallel tool calls), so their start/result events
  // interleave — a single `activeToolCall` would drop all but the last. Each
  // step is pushed on `tool_step_start` and updated in place on
  // `tool_step_result`.
  const toolStepsById = new Map<string, ToolCallPart>();
  let interruptPending = false;
  // client_tool interrupt (auto-executed by the ModelAdapter): unlike a
  // clarification it must NOT flip the message to requires-action — the same
  // run() continues with the executed result via the resume endpoint.
  let clientToolPending = false;
  let lastYieldTime = 0;
  const YIELD_INTERVAL = 50; // ms — max 20 yields/sec, matches NotebookModelAdapter

  function buildResult(): ChatModelRunResult {
    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'reasoning'; text: string }
      | ToolCallPart
      | SourcePart
    > = [];

    const groupId = activeToolCall ? activeToolCall.toolCallId : allToolCalls[0]?.toolCallId;

    if (accumulatedReasoning) {
      content.push({ type: 'reasoning' as const, text: accumulatedReasoning });
    }

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

    // Normalize [cite:N] → [N] before emitting, so CitationMarkdownText's
    // placeholder-badge layer (citationProcessing.ts:25) renders inline-reserved
    // boxes during streaming. Mirrors NotebookModelAdapter's buildResult and
    // prevents the SearchGraph "[cite:N]" markers from appearing as plain text.
    content.push({
      type: 'text' as const,
      text: accumulatedText.replace(/\[cite:(\d+)\]/g, '[$1]'),
    });

    const custom: GrueneratorMessageMetadata = {
      progress: { ...currentProgress, steps: [...progressSteps] },
    };
    if (receivedSearchResults.length > 0) custom.searchResults = receivedSearchResults;
    if (receivedCitations.length > 0) custom.citations = receivedCitations;
    if (receivedImage) custom.generatedImage = receivedImage;
    if (receivedSharepicData) custom.sharepicData = receivedSharepicData;
    if (receivedSocialPostData) custom.socialPostData = receivedSocialPostData;
    if (receivedChartData) custom.chartData = receivedChartData;
    if (receivedArtifactData) custom.artifactData = receivedArtifactData;
    if (receivedComputeData) custom.computeData = receivedComputeData;
    if (receivedBundestagData) custom.bundestagData = receivedBundestagData;
    if (receivedBahnData) custom.bahnData = receivedBahnData;
    if (receivedMetadata) custom.streamMetadata = receivedMetadata;
    if (receivedFollowUpSuggestions.length > 0)
      custom.followUpSuggestions = receivedFollowUpSuggestions;
    if (receivedConfirmAction) custom.confirmAction = receivedConfirmAction;
    if (receivedCreatedDocument) custom.createdDocument = receivedCreatedDocument;
    if (receivedReelProcessing) custom.reelProcessing = receivedReelProcessing;
    if (receivedReelPicker) custom.reelPicker = receivedReelPicker;
    if (agentInfo?.agentId) {
      custom.agentId = agentInfo.agentId;
      if (agentInfo.agentMention) custom.agentMention = agentInfo.agentMention;
    }

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
      const { event, data: rawData } = parseSSELine(line, currentEvent);
      if (!event || !rawData) continue;

      // Contract gate: every known event is validated against its wire
      // schema BEFORE the switch — the `as` casts below therefore assert on
      // schema-checked data instead of trusting the stream blindly. A
      // malformed event is dropped with a warning; unknown event names pass
      // through untouched (forward compatibility).
      const eventSchema = chatStreamEventSchemas[event];
      let data: unknown = rawData;
      if (eventSchema) {
        const gate = eventSchema.safeParse(rawData);
        if (!gate.success) {
          console.warn(
            `[GrueneratorModelAdapter] Dropping malformed "${event}" event:`,
            gate.error.issues[0],
            rawData
          );
          continue;
        }
        data = gate.data;
      }

      switch (event) {
        case 'thread_created': {
          const { threadId: tid } = data as { threadId: string };
          callbacks.onThreadCreated?.(tid);
          // Backend has now persisted any seeded initialAssistantMessage as
          // the first row of this thread. Drop the local copy so a future
          // new-thread creation doesn't replay a stale seed.
          useAgentStore.getState().setPendingInitialAssistantMessage(null);
          break;
        }

        case 'intent': {
          const { intent, message, reasoning, searchQuery, subQueries, searchSources, agentic } =
            data as {
              intent: SearchIntent;
              message: string;
              reasoning?: string;
              searchQuery?: string;
              subQueries?: string[] | null;
              searchSources?: string[] | null;
              agentic?: boolean;
            };
          let stage: ProgressStage = 'searching';
          if (intent === 'direct' || intent === 'artifact') stage = 'generating';
          else if (intent === 'image' || intent === 'sharepic' || intent === 'social_post')
            stage = 'generating_image';
          else if (intent === 'summary') stage = 'summarizing';
          transitionStep(stage);
          currentProgress = { stage, message, intent, reasoning };

          // Agentic respond path: the model drives the tool loop, so real
          // tool_step_* cards will arrive. Skip the intent-fabricated tool card
          // (and its search_complete result stamping) — otherwise a ghost card
          // would sit alongside the real ones.
          const toolName = agentic ? undefined : INTENT_TO_TOOL[intent];
          if (toolName) {
            const hasMultiSearch =
              (subQueries && subQueries.length > 0) || (searchSources && searchSources.length > 1);

            if (hasMultiSearch) {
              const queries = subQueries?.length ? subQueries : [searchQuery ?? ''];
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
            } else {
              // Don't fall back to `message` (the German status copy) — that
              // would display the status as the user's query. Empty string lets
              // the UI hide the chip text gracefully.
              const toolArgs = { query: searchQuery ?? '' };
              activeToolCall = {
                type: 'tool-call',
                toolCallId: `tc_${Date.now()}`,
                toolName,
                args: toolArgs,
                argsText: JSON.stringify(toolArgs),
              };
            }
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
          const { message, resultCount, results, researchMeta, examplesResult } = data as {
            message: string;
            resultCount: number;
            results?: SearchResult[];
            researchMeta?: unknown;
            examplesResult?: { press?: unknown[]; social?: unknown[]; message?: string };
          };
          if (results) receivedSearchResults = results;
          // Update searching step label with result count
          const searchStep = progressSteps.find((s) => s.stage === 'searching');
          if (searchStep) {
            searchStep.label = `${resultCount} Ergebnisse`;
            searchStep.status = 'completed';
            searchStep.completedAt = Date.now();
          }
          transitionStep('generating');
          currentProgress = {
            ...currentProgress,
            stage: 'generating',
            message,
            resultCount,
          };

          // Pick the right result shape per tool:
          // - research → researchMeta (rich orchestrator result)
          // - gruenerator_pressemitteilung_examples → { examples: press[], results }
          // - gruenerator_examples_search → { examples: social[], results }
          // - everything else → { results }
          const resultForTool = (toolName: string) => {
            if (toolName === 'research' && researchMeta != null) {
              return researchMeta as Record<string, unknown>;
            }
            if (toolName === 'gruenerator_pressemitteilung_examples' && examplesResult?.press) {
              return { results: results || [], examples: examplesResult.press };
            }
            if (toolName === 'gruenerator_examples_search' && examplesResult?.social) {
              return { results: results || [], examples: examplesResult.social };
            }
            return { results: results || [] };
          };

          for (let i = 0; i < allToolCalls.length; i++) {
            if (!allToolCalls[i].result) {
              allToolCalls[i] = {
                ...allToolCalls[i],
                result: resultForTool(allToolCalls[i].toolName),
              };
            }
          }
          if (activeToolCall) {
            activeToolCall = Object.assign({}, activeToolCall, {
              result: resultForTool(activeToolCall.toolName),
            });
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
          transitionStep('generating');
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

        case 'chart_data': {
          const { chart } = data as { chart?: ChartData };
          if (chart) receivedChartData = chart;
          yield buildResult();
          break;
        }

        case 'artifact': {
          const { artifact } = data as {
            artifact?: { type: 'html' | 'svg'; title: string; content: string };
          };
          if (artifact) {
            const active: ActiveArtifact = { id: `artifact-${Date.now()}`, ...artifact };
            receivedArtifactData = active;
            // Open the docked panel immediately.
            useArtifactLiveStore.getState().setActiveArtifact(active);
          }
          yield buildResult();
          break;
        }

        case 'compute': {
          const { compute } = data as { compute?: ComputeData };
          if (compute) receivedComputeData = compute;
          yield buildResult();
          break;
        }

        case 'bundestag': {
          const { bundestag } = data as {
            bundestag?: import('@gruenerator/contracts').BundestagPayload;
          };
          if (bundestag) receivedBundestagData = bundestag;
          yield buildResult();
          break;
        }

        case 'bahn': {
          const { bahn } = data as { bahn?: import('@gruenerator/contracts').BahnPayload };
          if (bahn) receivedBahnData = bahn;
          yield buildResult();
          break;
        }

        case 'sharepic_complete': {
          const payload = data as {
            message: string;
            variants?: unknown;
            canvasType?: string;
            initialProps?: Record<string, unknown>;
            alternatives?: unknown[];
            error?: string;
          };
          if (!payload.error) {
            // Validate at the boundary: only variants with a canonical
            // canvasType are kept, so a malformed type can never reach the
            // studio handoff / canvas mint.
            const validated = coerceSharepicVariants(payload.variants);
            if (validated) {
              receivedSharepicData = { variants: validated };
            } else if (isCanvasTemplateType(payload.canvasType) && payload.initialProps) {
              const legacyId =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `legacy-${Date.now()}`;
              receivedSharepicData = {
                variants: [
                  {
                    id: legacyId,
                    canvasType: payload.canvasType,
                    initialProps: payload.initialProps,
                  },
                ],
              };
            }
          }
          transitionStep(payload.error ? 'error' : 'generating');
          currentProgress = {
            ...currentProgress,
            stage: payload.error ? 'error' : 'generating',
            message: payload.message,
          };
          yield buildResult();
          break;
        }

        case 'social_post_complete': {
          const payload = data as {
            message: string;
            post?: import('@gruenerator/contracts').SocialPostPayload;
            error?: string;
          };
          if (!payload.error && payload.post) {
            receivedSocialPostData = payload.post;
            useSocialPostLiveStore.getState().upsertEntry(payload.post);
          }
          // Text half only — the sharepic half drives the stage transitions
          // via its own sharepic_complete; don't flip to error here when just
          // the text failed (the card shows the degradation).
          yield buildResult();
          break;
        }

        case 'social_post_updated': {
          const payload = data as {
            postId: string;
            post: import('@gruenerator/contracts').SocialPostPayload;
            summary: string;
          };
          useSocialPostLiveStore.getState().upsertEntry(payload.post);
          break;
        }

        case 'social_post_edit_error': {
          const { error } = data as { postId?: string; error: string };
          console.warn('[GrueneratorModelAdapter] social_post_edit_error:', error);
          break;
        }

        case 'sharepic_minted': {
          const { variantId, canvasId } = data as { variantId: string; canvasId: string };
          useSharepicLiveStore.getState().upsertEntry(variantId, { canvasId });
          break;
        }

        case 'sharepic_updated': {
          // Validated by the contract gate above — canvasType is guaranteed
          // canonical, so junk template types can never enter the live store.
          const payload = data as import('@gruenerator/contracts').SharepicUpdatedEvent;
          useSharepicLiveStore.getState().upsertEntry(payload.variantId, {
            canvasId: payload.canvasId,
            canvasType: payload.canvasType,
            version: payload.version,
            state: payload.state ?? null,
            ...(payload.pages ? { pages: payload.pages } : {}),
            summary: payload.summary,
            thumbnailDirty: true,
          });
          break;
        }

        case 'sharepic_edit_error': {
          const { error } = data as { variantId?: string; error: string };
          console.warn('[GrueneratorModelAdapter] sharepic_edit_error:', error);
          break;
        }

        case 'reel_processing': {
          receivedReelProcessing = data as { uploadId: string; filename: string };
          yield buildResult();
          break;
        }

        case 'reel_picker': {
          receivedReelPicker = data as ReelPickerData;
          yield buildResult();
          break;
        }

        case 'reel_updated': {
          const payload = data as {
            projectId: string;
            title: string;
            segments: Array<{ id: number; startTime: number; endTime: number; text: string }>;
            summary: string;
            changedIndices: number[];
          };
          const reelStore = useReelLiveStore.getState();
          reelStore.upsertEntry(payload.projectId, {
            title: payload.title,
            segments: payload.segments,
            summary: payload.summary,
            changedIndices: payload.changedIndices,
          });
          // Auto-open the docked panel on the edited reel.
          if (reelStore.activeReel?.projectId !== payload.projectId) {
            reelStore.setActiveReel({ projectId: payload.projectId, title: payload.title });
          }
          break;
        }

        case 'reel_edit_error': {
          const { error } = data as { projectId?: string; error: string };
          console.warn('[GrueneratorModelAdapter] reel_edit_error:', error);
          break;
        }

        // Agentic tool loop (sharepic edit + general respond loop): each tool
        // step renders as a tool-call part, mirroring the thinking_step
        // archive-and-replace mechanics (including the duplicate-stepId guard).
        case 'tool_step_start': {
          const {
            stepId,
            toolName,
            args,
            title: serverTitle,
            serverName,
          } = data as {
            stepId: string;
            toolName: string;
            args?: Record<string, unknown>;
            title?: string;
            serverName?: string;
          };
          // Prefer a server-provided title; else the legacy mcpToolNode
          // `mcp_tool` server/tool label; else the sharepic-specific map; else a
          // generic label derived from the (possibly MCP-namespaced) name.
          const title =
            serverTitle ??
            (toolName === 'mcp_tool'
              ? `${(args?.server as string) ?? 'MCP'}${args?.tool ? ` · ${args.tool as string}` : ''}`
              : (TOOL_STEP_TITLES[toolName] ??
                `${formatNamespacedToolLabel(toolName, serverName)}…`));
          const alreadyKnown =
            toolStepsById.has(stepId) || allToolCalls.some((tc) => tc.toolCallId === stepId);
          if (!alreadyKnown) {
            const toolArgs = { query: title, ...(args ?? {}) };
            const toolCall: ToolCallPart = {
              type: 'tool-call',
              toolCallId: stepId,
              toolName,
              args: toolArgs as Record<string, string | number | boolean | null>,
              argsText: JSON.stringify(toolArgs),
            };
            // Push immediately so a parallel sibling's start doesn't orphan this
            // card; the result updates it in place.
            toolStepsById.set(stepId, toolCall);
            allToolCalls.push(toolCall);
          }
          currentProgress = { stage: 'searching', message: title };
          yield buildResult();
          break;
        }

        case 'tool_step_result': {
          const { stepId, ok, summary, result } = data as {
            stepId: string;
            toolName: string;
            ok: boolean;
            summary?: string;
            result?: Record<string, unknown>;
          };
          const pending = toolStepsById.get(stepId);
          if (pending) {
            // Stamp the rich per-tool result (results/examples/researchMeta) so
            // the tool-ui card renders mid-stream from the real tool output,
            // not just an ok/summary status. ok/summary are folded in for the
            // generic status chip. Replace by identity so memoized consumers
            // re-render.
            // A system MCP tool may ship an MCP-Apps widget: lift its `ui://`
            // pointer onto `mcp.app` so assistant-ui's mcpApp renderer mounts
            // the sandboxed widget iframe in place of the normal tool card.
            const uiResource = (result as { uiResource?: { uri?: unknown; mimeType?: unknown } })
              ?.uiResource;
            const widgetUri =
              uiResource && typeof uiResource.uri === 'string' && uiResource.uri.startsWith('ui://')
                ? uiResource.uri
                : null;
            const updated: ToolCallPart = {
              ...pending,
              result: { ...(result ?? {}), ok, ...(summary ? { summary } : {}) },
              ...(widgetUri
                ? {
                    mcp: {
                      app: {
                        resourceUri: widgetUri,
                        ...(typeof uiResource?.mimeType === 'string'
                          ? { mimeType: uiResource.mimeType }
                          : {}),
                      },
                    },
                  }
                : {}),
            };
            toolStepsById.set(stepId, updated);
            const idx = allToolCalls.indexOf(pending);
            if (idx >= 0) allToolCalls[idx] = updated;
          }
          currentProgress = {
            stage: 'generating',
            message: summary ?? (ok ? 'Änderung angewendet' : 'Schritt fehlgeschlagen'),
          };
          yield buildResult();
          break;
        }

        case 'response_start': {
          const { message } = data as { message: string };
          transitionStep('generating');
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
            // The backend heartbeat (responseStreamingService.startResponseHeartbeat)
            // re-emits the SAME stepId every 3s. If it matches the current
            // activeToolCall, or is already in allToolCalls, skip the
            // archive-and-replace below — otherwise we'd render two tool-call
            // parts with the same toolCallId and trip assistant-ui's
            // `tapResources` with "Duplicate key toolCallId-…".
            const isDuplicateStepId =
              (activeToolCall !== null && activeToolCall.toolCallId === stepId) ||
              allToolCalls.some((tc) => tc.toolCallId === stepId);
            if (!isDuplicateStepId) {
              // Preserve any pre-existing activeToolCall (e.g. the intent-derived
              // gruenerator_examples_search tool-call set by the `intent` event)
              // before overwriting with this thinking_step's tool. Otherwise the
              // examples tool-call is orphaned and search_complete's result has
              // nowhere to land — leaving the UI with classify/rerank chips and
              // no examples card.
              if (activeToolCall !== null && !allToolCalls.includes(activeToolCall)) {
                allToolCalls.push(activeToolCall);
              }
              const toolArgs = { query: (args?.query as string) || title, ...args };
              activeToolCall = {
                type: 'tool-call',
                toolCallId: stepId,
                toolName: mappedToolName,
                args: toolArgs as Record<string, string | number | boolean | null>,
                argsText: JSON.stringify(toolArgs),
              };
            }
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

        case 'progress_step': {
          // Internal pipeline stage (classify, rerank, brief). Updates the
          // progress indicator but MUST NOT touch activeToolCall/allToolCalls
          // — those are reserved for user-facing tools dispatched via the
          // `intent` event + `thinking_step`. Conflating the two is what
          // caused the search→rerank race that orphaned the rich
          // examples/search/web tool-cards (see PR history).
          const { title, status } = data as {
            stepId: string;
            toolName: string;
            title: string;
            status: 'in_progress' | 'completed';
          };
          if (status === 'in_progress') {
            currentProgress = { ...currentProgress, stage: 'searching', message: title };
          } else if (status === 'completed') {
            currentProgress = { ...currentProgress, message: title };
          }
          yield buildResult();
          break;
        }

        case 'text_delta': {
          const delta = (data as { text: string }).text;
          accumulatedText += delta;
          const now = performance.now();
          if (now - lastYieldTime >= YIELD_INTERVAL) {
            lastYieldTime = now;
            yield buildResult();
          }
          break;
        }

        case 'reasoning_delta': {
          accumulatedReasoning += (data as { text: string }).text;
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
            `[GrueneratorModelAdapter] Model fallback: ${info.from.id} → ${info.to.id} (${info.reason})`
          );
          break;
        }

        case 'warning': {
          // Non-fatal degradation the user should know about (model fell back to
          // default, Wolke refs dropped, …). Carries a ready-made German message.
          // Surface as a toast; fall back to console where sonner isn't installed
          // (e.g. mobile host), mirroring dictationErrorHandler.
          const { code, message } = data as { code: string; message: string };
          console.warn(`[GrueneratorModelAdapter] warning (${code}): ${message}`);
          if (message) {
            void import('sonner')
              .then(({ toast }) => toast.warning(message))
              .catch(() => {
                // sonner not installed in host app — console-only above is enough.
              });
          }
          break;
        }

        case 'interrupt': {
          const payload = data as {
            interruptType?: 'clarification' | 'client_tool';
            toolName?: string;
            args?: Record<string, unknown>;
            threadId?: string;
          };
          if (payload.interruptType === 'client_tool' && payload.toolName) {
            clientToolPending = true;
            outcome.clientToolInterrupt = {
              toolName: payload.toolName,
              args: payload.args ?? {},
              ...(payload.threadId != null && { threadId: payload.threadId }),
            };
          } else {
            interruptPending = true;
          }
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
          if (interrupted && !clientToolPending) interruptPending = true;
          transitionStep('complete');
          currentProgress = { stage: 'complete', message: '' };
          break;
        }

        case 'confirm_action': {
          receivedConfirmAction = data as ConfirmActionData;
          yield buildResult();
          break;
        }

        case 'document_created': {
          receivedCreatedDocument = data as DocumentCreatedData;
          yield buildResult();
          break;
        }

        case 'document_indexed': {
          const { documentId } = data as { documentId: string };
          outcome.indexedDocumentIds.push(documentId);
          break;
        }

        case 'trigger_doc_edit': {
          // Live document edit (docs editor surface). The chat backend has
          // classified intent=edit_current_doc and forwards the user's prompt
          // here so the docs frontend can dispatch into BlockNote's AIExtension.
          // Handlers are keyed by documentId — there's exactly one docs surface
          // per document, registered when DocsAssistantChat mounts.
          const parsed = triggerDocEditSchema.safeParse(data);
          if (!parsed.success) {
            console.warn('[ChatAdapter] trigger_doc_edit payload failed validation', parsed.error);
            break;
          }
          const payload = parsed.data;
          const handler = useChatConfigStore
            .getState()
            .documentEditHandlers.get(payload.targetDocumentId);
          if (handler) {
            try {
              await handler(payload);
            } catch (err) {
              console.warn('[ChatAdapter] documentEditHandler threw', err);
            }
          } else {
            console.warn(
              '[ChatAdapter] trigger_doc_edit received but no handler registered for doc',
              payload.targetDocumentId
            );
          }
          break;
        }

        case 'trigger_board_action': {
          // Live board edit (boards editor surface). The chat backend has
          // classified intent=edit_current_board and forwards the user's prompt
          // here so the boards frontend can plan + apply operations on the live
          // Yjs board. Handlers are keyed by boardId — one boards surface per
          // board, registered when BoardAssistantProvider mounts.
          const parsed = triggerBoardActionSchema.safeParse(data);
          if (!parsed.success) {
            console.warn(
              '[ChatAdapter] trigger_board_action payload failed validation',
              parsed.error
            );
            break;
          }
          const payload = parsed.data;
          const handler = useChatConfigStore
            .getState()
            .boardActionHandlers.get(payload.targetBoardId);
          if (handler) {
            try {
              await handler(payload);
            } catch (err) {
              console.warn('[ChatAdapter] boardActionHandler threw', err);
            }
          } else {
            console.warn(
              '[ChatAdapter] trigger_board_action received but no handler registered for board',
              payload.targetBoardId
            );
          }
          break;
        }

        case 'editor_operations': {
          // Tool-based editor edit (CHAT_EDIT_TOOL_SURFACES): the agentic loop's
          // edit_document tool planned ops server-side; apply them in place via
          // the surface's registered handler (Univer / Yjs / Konva bridge).
          // Keyed by targetId, parallel to the trigger_doc_edit path (which stays
          // the fallback when the backend flag is off).
          const parsed = editorOperationsEventSchema.safeParse(data);
          if (!parsed.success) {
            console.warn('[ChatAdapter] editor_operations payload failed validation', parsed.error);
            break;
          }
          const payload = parsed.data;
          const handler = useChatConfigStore.getState().editorOpsHandlers.get(payload.targetId);
          if (handler) {
            try {
              await handler(payload);
            } catch (err) {
              console.warn('[ChatAdapter] editorOpsHandler threw', err);
            }
          } else {
            console.warn(
              '[ChatAdapter] editor_operations received but no handler registered for target',
              payload.targetId
            );
          }
          break;
        }

        // ── Search mode events ──
        case 'sources_preview': {
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
          const payload = data as ChatErrorEventPayload;
          transitionStep('error');
          throw new ChatStreamError(payload.error ?? 'Es ist ein Fehler aufgetreten.', payload);
        }
      }
    }
  }

  const finalResult = buildResult();
  outcome.lastResult = finalResult;
  yield finalResult;

  outcome.interrupted = interruptPending;

  if (receivedMetadata && !interruptPending && !clientToolPending) {
    callbacks.onComplete?.(receivedMetadata);
  }
}
