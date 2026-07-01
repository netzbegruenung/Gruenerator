/**
 * Post-Response Service
 *
 * Handles everything that happens after the AI response is generated:
 * - Persist assistant message with metadata
 * - Touch thread timestamp
 * - Trigger async thread title generation for new threads
 * - Save attachment metadata
 * - Save conversation to mem0 memory
 */

import { generateThreadTags } from '../../../services/chat/threadTagService.js';
import { generateThreadTitle } from '../../../services/chat/threadTitleService.js';
import { shouldExtractMemories } from '../../../services/mem0/gatekeeperService.js';
import { getMem0Instance } from '../../../services/mem0/index.js';
import { maybeRecompilePersona } from '../../../services/mem0/personaService.js';
import { createLogger } from '../../../utils/logger.js';
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';
import { type AIWorkerPool } from '../../../workers/types.js';

import { saveThreadAttachment } from './attachmentPersistenceService.js';
import { extractTextContent } from './messageHelpers.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type { SharepicVariant } from './sharepicVariantHelpers.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  ResearchToolResult,
  SearchResult,
  SearchSource,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('PostResponse');

export const INTENT_TO_TOOL: Record<string, string> = {
  search: 'gruenerator_search',
  web: 'web_search',
  research: 'research',
  examples: 'gruenerator_examples_search',
  pressemitteilung_examples: 'gruenerator_pressemitteilung_examples',
  image: 'image_generate',
  image_edit: 'image_edit',
  sharepic: 'sharepic',
  scrape_url: 'scrape_url',
};

/**
 * Result payload shape for non-research tool calls (search, web, examples).
 * The chat UI's generic result renderers read `result.results`. The examples
 * cards (`PressemitteilungExamplesCard`, generic `ToolCallUI`) additionally
 * read `result.examples`, so we attach a kind-specific list when present.
 */
interface SearchToolCallResult {
  results: SearchResult[];
  examples?: unknown[];
}

interface ImageToolCallResult {
  url: string;
  filename: string;
  prompt: string;
  style: string | null;
  generationTimeMs: number;
}

interface SharepicToolCallResult {
  variants: SharepicVariant[];
}

/** Shape the frontend `parseScrapeResult` reads for the link-preview card. */
interface ScrapeToolCallResult {
  content: string;
}

type ToolCallResult =
  | SearchToolCallResult
  | ResearchToolResult
  | ImageToolCallResult
  | SharepicToolCallResult
  | ScrapeToolCallResult;

interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  args: { query?: string; url?: string };
  result: ToolCallResult;
}

/**
 * Build the result payload for a single tool call.
 * Research intent gets the rich `ResearchToolResult` shape that
 * `ResearchResultUI` expects (answer/citations/confidence/searchSteps).
 * Image/sharepic intents get their respective shapes so the corresponding
 * cards rehydrate on thread reload. All other intents get the generic
 * `{ results }` shape.
 */
function buildToolCallResult(
  toolName: string,
  finalState: ChatGraphState,
  generatedImage: GeneratedImageResult | null,
  sharepicVariants: SharepicVariant[]
): ToolCallResult {
  if (toolName === 'research' && finalState.researchMeta) {
    return finalState.researchMeta;
  }
  if ((toolName === 'image_generate' || toolName === 'image_edit') && generatedImage) {
    return {
      url: generatedImage.url,
      filename: generatedImage.filename,
      prompt: generatedImage.prompt,
      style: generatedImage.style,
      generationTimeMs: generatedImage.generationTimeMs,
    };
  }
  if (toolName === 'sharepic') {
    return { variants: sharepicVariants };
  }
  const base: SearchToolCallResult = {
    results: finalState.searchResults?.slice(0, 10) || [],
  };
  // Per-kind rich list for the examples cards (PressemitteilungExamplesCard
  // reads result.examples with {title, body, lv, url}; generic ToolCallUI
  // reads result.examples for social posts too).
  const ex = finalState.examplesResult;
  if (ex) {
    if (toolName === 'gruenerator_pressemitteilung_examples' && ex.press) {
      base.examples = ex.press;
    } else if (toolName === 'gruenerator_examples_search' && ex.social) {
      base.examples = ex.social;
    }
  }
  return base;
}

function buildToolCalls(
  classifiedState: ChatGraphState,
  finalState: ChatGraphState,
  generatedImage: GeneratedImageResult | null,
  sharepicVariants: SharepicVariant[]
): PersistedToolCall[] | undefined {
  const toolName = INTENT_TO_TOOL[finalState.intent];
  if (!toolName) return undefined;

  // scrape_url renders a link-preview card per crawled page. The frontend parser
  // reads `args.url` + `result.content`, so emit one tool call per result rather
  // than the generic {query}/{results} shape.
  if (toolName === 'scrape_url') {
    const crawled = (finalState.searchResults || []).filter((r) => r.url);
    if (crawled.length === 0) return undefined;
    return crawled.slice(0, 5).map((r, idx) => ({
      toolCallId: `tc_${Date.now()}_${idx}`,
      toolName: 'scrape_url',
      args: { url: r.url as string },
      result: { content: r.content || '' },
    }));
  }

  const subQueries = classifiedState.subQueries;
  const searchSources: SearchSource[] = classifiedState.searchSources || [];
  const hasMultiSearch = (subQueries && subQueries.length > 0) || searchSources.length > 1;

  if (hasMultiSearch) {
    const queries = subQueries?.length ? subQueries : [classifiedState.searchQuery || ''];
    const sources: (SearchSource | null)[] = searchSources.length > 1 ? searchSources : [null];
    const toolCalls: PersistedToolCall[] = [];
    let idx = 0;
    for (const q of queries) {
      for (const src of sources) {
        const tn =
          src === 'web' ? 'web_search' : src === 'documents' ? 'gruenerator_search' : toolName;
        toolCalls.push({
          toolCallId: `tc_${Date.now()}_${idx++}`,
          toolName: tn,
          args: { query: q },
          result: buildToolCallResult(tn, finalState, generatedImage, sharepicVariants),
        });
      }
    }
    return toolCalls;
  }

  return [
    {
      toolCallId: `tc_${Date.now()}`,
      toolName,
      args: { query: classifiedState.searchQuery || '' },
      result: buildToolCallResult(toolName, finalState, generatedImage, sharepicVariants),
    },
  ];
}

export interface PersistParams {
  threadId: string;
  userId: string;
  fullText: string;
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
  generatedImage: GeneratedImageResult | null;
  sharepicVariants: SharepicVariant[];
  isNewThread: boolean;
  lastUserMessage: ModelMessage;
  processedMeta: ProcessedAttachmentMeta[];
  aiWorkerPool: AIWorkerPool;
  requestId: string;
  /** Whether the user has the memory beta feature enabled (profiles.memory_enabled). */
  memoryEnabled: boolean;
}

/**
 * Persist the assistant response and handle all post-response side effects.
 */
export async function persistAssistantResponse(params: PersistParams): Promise<void> {
  const {
    threadId,
    userId,
    fullText,
    finalState,
    classifiedState,
    generatedImage,
    sharepicVariants,
    isNewThread,
    lastUserMessage,
    processedMeta,
    aiWorkerPool,
    requestId,
    memoryEnabled,
  } = params;

  if (!threadId || (!fullText && !generatedImage && sharepicVariants.length === 0)) return;

  try {
    const toolCalls = buildToolCalls(classifiedState, finalState, generatedImage, sharepicVariants);
    await createMessage(threadId, 'assistant', fullText || null, {
      intent: finalState.intent,
      searchCount: finalState.searchCount,
      citations: finalState.citations,
      searchResults: finalState.searchResults?.slice(0, 10) || [],
      generatedImage: generatedImage
        ? {
            url: generatedImage.url,
            filename: generatedImage.filename,
            prompt: generatedImage.prompt,
            style: generatedImage.style,
            generationTimeMs: generatedImage.generationTimeMs,
          }
        : undefined,
      toolCalls,
    });

    if (toolCalls) {
      log.debug(
        `[ChatGraph] Persisted ${toolCalls.length} toolCall(s): ${toolCalls.map((tc) => tc.toolName).join(', ')}, results=${finalState.searchResults?.length ?? 0}`
      );
    }

    await touchThread(threadId);

    log.info(
      `[ChatGraph] Title generation check: isNewThread=${isNewThread}, hasLastUserMessage=${!!lastUserMessage}, threadId=${threadId}`
    );
    if (isNewThread && lastUserMessage) {
      const userText = extractTextContent(lastUserMessage.content);
      log.info(`[ChatGraph] Triggering title generation for ${threadId}`, {
        userTextLen: userText?.length ?? 0,
        userTextPreview: userText?.slice(0, 100),
        fullTextLen: fullText?.length ?? 0,
        fullTextPreview: fullText?.slice(0, 100),
        imageGenerated: !!generatedImage,
      });
      generateThreadTitle(threadId, userText, fullText, aiWorkerPool, {
        imageGenerated: !!generatedImage,
      }).catch((err) => log.warn('[ChatGraph] Thread title generation failed:', err));
      // Auto-tag from the same first exchange. Triggered here (not only via the
      // client generate-title endpoint) so every flow — web, mobile, resumed —
      // gets tags; saveTagsIfEmpty keeps it idempotent and non-clobbering.
      generateThreadTags(threadId, userText, fullText).catch((err) =>
        log.warn('[ChatGraph] Thread tag generation failed:', err)
      );
    } else if (!isNewThread) {
      log.info(`[ChatGraph] Skipping title generation — not a new thread (threadId=${threadId})`);
    } else if (!lastUserMessage) {
      log.warn(`[ChatGraph] Skipping title generation — no lastUserMessage (threadId=${threadId})`);
    }

    log.info(`[ChatGraph] Message persisted for thread ${threadId}`);

    if (processedMeta.length > 0) {
      for (const meta of processedMeta) {
        try {
          await saveThreadAttachment({
            threadId,
            messageId: null,
            userId,
            name: meta.name,
            mimeType: meta.mimeType,
            sizeBytes: meta.sizeBytes,
            isImage: meta.isImage,
            extractedText: meta.extractedText,
            ...(meta.imageData != null && { imageData: meta.imageData }),
          });
        } catch (attachError) {
          log.error(`[ChatGraph] Failed to save attachment ${meta.name}:`, attachError);
        }
      }
      log.info(`[ChatGraph] Saved ${processedMeta.length} attachments for thread ${threadId}`);
    }

    const mem0 = getMem0Instance();
    if (mem0 && lastUserMessage && fullText && memoryEnabled) {
      const userText = extractTextContent(lastUserMessage.content);

      // Gatekeeper: check if this conversation contains memorizable info
      shouldExtractMemories(userText, fullText)
        .then((decision) => {
          if (!decision.shouldExtract) {
            log.info(
              `[${requestId}] Gatekeeper: skipping memory extraction (${decision.durationMs}ms)`
            );
            return;
          }

          log.info(
            `[${requestId}] Gatekeeper: extracting [${decision.categories.join(', ')}] (${decision.durationMs}ms)`
          );

          return mem0
            .addMemories(
              [
                { role: 'user', content: userText },
                { role: 'assistant', content: fullText },
              ],
              userId,
              { threadId, categories: decision.categories }
            )
            .then(() => {
              // Async persona recompilation (fire-and-forget)
              maybeRecompilePersona(userId).catch((e) =>
                log.warn(`[${requestId}] Persona recompilation failed:`, e)
              );
            });
        })
        .catch((memError) => {
          reportBackgroundError(memError, { job: 'chat-memory-save', requestId, userId });
        });
    }
  } catch (error) {
    log.error('[ChatGraph] Error persisting message:', error);
  }
}

/**
 * Persist a resumed response (simpler — no title gen, no attachments, no mem0).
 */
export async function persistResumedResponse(params: {
  threadId: string;
  fullText: string;
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
}): Promise<void> {
  const { threadId, fullText, finalState, classifiedState } = params;

  if (!threadId || !fullText) return;

  try {
    const toolCalls = buildToolCalls(classifiedState, finalState, null, []);
    await createMessage(threadId, 'assistant', fullText, {
      intent: finalState.intent,
      searchCount: finalState.searchCount,
      citations: finalState.citations,
      searchResults: finalState.searchResults?.slice(0, 10) || [],
      resumed: true,
      toolCalls,
    });
    await touchThread(threadId);
    log.info(`[ChatGraph:Resume] Message persisted for thread ${threadId}`);
  } catch (error) {
    log.error('[ChatGraph:Resume] Error persisting message:', error);
  }
}
