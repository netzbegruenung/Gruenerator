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

import { generateThreadTitle } from '../../../services/chat/threadTitleService.js';
import { getMem0Instance } from '../../../services/mem0/index.js';
import { createLogger } from '../../../utils/logger.js';

import { saveThreadAttachment } from './attachmentPersistenceService.js';
import { extractTextContent } from './messageHelpers.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type {
  ChatGraphState,
  GeneratedImageResult,
  SearchSource,
} from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('PostResponse');

export const INTENT_TO_TOOL: Record<string, string> = {
  search: 'gruenerator_search',
  web: 'web_search',
  research: 'research',
  examples: 'gruenerator_examples_search',
};

function buildToolCalls(classifiedState: ChatGraphState, finalState: ChatGraphState) {
  const toolName = INTENT_TO_TOOL[finalState.intent];
  if (!toolName) return undefined;

  const subQueries = classifiedState.subQueries;
  const searchSources: SearchSource[] = classifiedState.searchSources || [];
  const hasMultiSearch = (subQueries && subQueries.length > 0) || searchSources.length > 1;

  if (hasMultiSearch) {
    const queries = subQueries?.length ? subQueries : [classifiedState.searchQuery || ''];
    const sources: (SearchSource | null)[] = searchSources.length > 1 ? searchSources : [null];
    const toolCalls = [];
    let idx = 0;
    for (const q of queries) {
      for (const src of sources) {
        const tn =
          src === 'web' ? 'web_search' : src === 'documents' ? 'gruenerator_search' : toolName;
        toolCalls.push({
          toolCallId: `tc_${Date.now()}_${idx++}`,
          toolName: tn,
          args: { query: q },
          result: { results: finalState.searchResults?.slice(0, 10) || [] },
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
      result: { results: finalState.searchResults?.slice(0, 10) || [] },
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
  isNewThread: boolean;
  lastUserMessage: any;
  processedMeta: ProcessedAttachmentMeta[];
  aiWorkerPool: any;
  requestId: string;
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
    isNewThread,
    lastUserMessage,
    processedMeta,
    aiWorkerPool,
    requestId,
  } = params;

  if (!threadId || (!fullText && !generatedImage)) return;

  try {
    const toolCalls = buildToolCalls(classifiedState, finalState);
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
          });
        } catch (attachError) {
          log.error(`[ChatGraph] Failed to save attachment ${meta.name}:`, attachError);
        }
      }
      log.info(`[ChatGraph] Saved ${processedMeta.length} attachments for thread ${threadId}`);
    }

    const mem0 = getMem0Instance();
    if (mem0 && lastUserMessage && fullText) {
      const userText = extractTextContent(lastUserMessage.content);
      mem0
        .addMemories(
          [
            { role: 'user', content: userText },
            { role: 'assistant', content: fullText },
          ],
          userId,
          { threadId }
        )
        .catch((memError) => {
          log.warn(`[${requestId}] Async memory save failed:`, memError);
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
    const toolCalls = buildToolCalls(classifiedState, finalState);
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
