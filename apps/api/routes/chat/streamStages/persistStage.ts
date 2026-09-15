/**
 * Stage 4: persist the turn, emit the approvals it needs, close the stream.
 *
 * The persist write is kicked off before the confirm/save-as-doc steps but
 * awaited only after `done` — the client already has the full response, so a
 * slow Postgres write must not delay it. `persistAssistantResponse` catches
 * its own errors; the outcome decides which warning (if any) still reaches the
 * client before `sse.end()`.
 */

import { createLogger } from '../../../utils/logger.js';
import { emitConfirmAction } from '../services/confirmActionService.js';
import { buildCreateTurnContext } from '../services/createTurn.js';
import { generateAndCreateDocument } from '../services/intentExecutionService.js';
import { extractTextContent } from '../services/messageHelpers.js';
import { persistAssistantResponse } from '../services/postResponseService.js';
import { sendChatWarning, type SSEWriter } from '../services/sseHelpers.js';
import { discardPendingAssistantIfEmpty } from '../services/threadPersistenceService.js';

import { type CleanupPending, type StreamBody, type StreamHandlerResult } from './types.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { ModelMessage } from 'ai';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

/** The persist call is the contract for the turn's artifact fields — derive
 *  them from it rather than re-declaring shapes that must match. */
type PersistParams = Parameters<typeof persistAssistantResponse>[0];

export interface PersistStageParams {
  sse: SSEWriter;
  req: Request;
  finalState: ChatGraphState;
  classifiedState: ChatGraphState;
  cleanupPending: CleanupPending;
  fullText: string;
  actualThreadId: string | undefined;
  userId: string;
  requestId: string;
  validMessages: StreamContext['validMessages'];
  lastUserMessage: StreamContext['lastUserMessage'];
  processedMeta: StreamContext['processedMeta'];
  isNewThread: boolean;
  memoryRetrieveTimeMs: number;
  generatedImage: PersistParams['generatedImage'];
  sharepicVariants: PersistParams['sharepicVariants'];
  createdDocument: CreatedDocument | null;
  createdBoard: ChatGraphState['createdBoard'];
  agenticSteps: PersistedStep[] | undefined;
  /** Handed to the client in `done` so its feedback buttons can score the
   *  turn. Undefined when Langfuse is off or the turn skipped the LLM. */
  langfuseTraceId: string | undefined;
  pendingId: string | null;
  userMessageId: string | null;
  agentId: StreamBody['agentId'];
  rawDocMentionIds: StreamBody['docMentionIds'];
  rawBoardIds: StreamBody['boardIds'];
}

export async function runPersistStage({
  sse,
  req,
  finalState,
  classifiedState,
  cleanupPending,
  fullText,
  actualThreadId,
  userId,
  requestId,
  validMessages,
  lastUserMessage,
  processedMeta,
  isNewThread,
  memoryRetrieveTimeMs,
  generatedImage,
  sharepicVariants,
  createdDocument,
  createdBoard,
  agenticSteps,
  langfuseTraceId,
  pendingId,
  userMessageId,
  agentId,
  rawDocMentionIds,
  rawBoardIds,
}: PersistStageParams): Promise<StreamHandlerResult> {
  // === Stage 4: Persist & complete ===
  // Stop the placeholder writer BEFORE persist: its final throttle write
  // must not race the finalize UPDATE (both write the same row).
  await cleanupPending(false);
  // Kicked off here but awaited only after sse.end(): the client already
  // has the full response, so a slow Postgres write must not delay the
  // done event. persistAssistantResponse catches its own errors.
  const persistPromise = persistAssistantResponse({
    threadId: actualThreadId!,
    userId,
    fullText,
    finalState,
    classifiedState,
    generatedImage,
    sharepicVariants,
    createdDocument,
    isNewThread,
    lastUserMessage: lastUserMessage as ModelMessage,
    processedMeta,
    requestId,
    ...(agentId != null && { agentId }),
    ...(agenticSteps != null && { agenticSteps }),
    ...(langfuseTraceId != null && { traceId: langfuseTraceId }),
    ...(pendingId != null && { pendingMessageId: pendingId }),
    ...(userMessageId != null && { userMessageId }),
  });

  // === Stage 4b: Emit confirm_action for intents that need user approval ===
  if (actualThreadId && classifiedState.intent !== 'save_as_doc') {
    await emitConfirmAction({
      sse,
      actualThreadId,
      userId,
      fullText,
      finalState,
      classifiedState,
      ...(rawDocMentionIds != null && { rawDocMentionIds }),
      ...(rawBoardIds != null && { rawBoardIds }),
    });
  }

  // === Stage 4c: Handle save_as_doc ===
  if (classifiedState.intent === 'save_as_doc' && fullText) {
    const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
    // Same transcript builder the other create turns use, so "speicher das
    // als Dokument" and "mach ein PDF draus" see the same thread. It used to
    // be a hand-rolled `slice(-4)` here and nothing at all there. The answer
    // being saved is generated in THIS turn and is not in `validMessages`
    // yet, so it is appended.
    const conversationContext = [
      buildCreateTurnContext(validMessages),
      `assistant: ${fullText.slice(0, 3000)}`,
    ]
      .filter((part) => part.trim())
      .join('\n');

    await generateAndCreateDocument({
      sse,
      classifiedState,
      req,
      ...(actualThreadId != null && { actualThreadId }),
      userId,
      userContent: lastUserText,
      subtypeOverride: classifiedState.documentSubtype,
      conversationContext,
      intent: 'save_as_doc',
      skipTerminate: true,
    });
  }

  const totalTimeMs = Date.now() - finalState.startTime;
  sse.send('done', {
    ...(actualThreadId != null && { threadId: actualThreadId }),
    citations: finalState.citations,
    generatedImage,
    // Compound board turn: boards render from these `done` fields (no card
    // SSE), mirroring the single-pass @board-erstellen handler.
    ...(createdBoard != null && {
      boardId: createdBoard.boardId,
      boardGeneratedStructure: createdBoard.boardGeneratedStructure,
    }),
    metadata: {
      intent: finalState.intent,
      searchCount: finalState.searchCount || 0,
      totalTimeMs,
      ...(finalState.classificationTimeMs != null && {
        classificationTimeMs: finalState.classificationTimeMs,
      }),
      ...(finalState.searchTimeMs != null && { searchTimeMs: finalState.searchTimeMs }),
      ...(finalState.imageTimeMs != null && { imageTimeMs: finalState.imageTimeMs }),
      ...(finalState.summaryTimeMs != null && { summaryTimeMs: finalState.summaryTimeMs }),
      ...(memoryRetrieveTimeMs > 0 && { memoryRetrieveTimeMs }),
      ...(langfuseTraceId != null && { traceId: langfuseTraceId }),
      // Dezente Rezept-Attribution: welche Schreibvorgabe diesen Turn geformt
      // hat (Prompt-Tür oder `rezept_laden`). Titel + Mention, nie der Text.
      ...(finalState.usedRecipes?.length && { recipesUsed: finalState.usedRecipes }),
    },
  });

  log.info(`[ChatGraph] Complete: ${fullText.length} chars in ${totalTimeMs}ms`);
  // Await BEFORE ending the stream: the client keeps reading until the
  // stream closes, so a warning emitted here still reaches it. Previously
  // this ran after sse.end() and a failed persist had no way to be
  // reported — the turn looked perfect live and was gone on reload.
  const persistOutcome = await persistPromise;
  if (persistOutcome.discarded) sendChatWarning(sse, 'turn_discarded');
  else if (!persistOutcome.ok) sendChatWarning(sse, 'persist_failed');
  sse.end();
  // Safety net: if persist finalized (or skipped) but the placeholder is
  // still an empty streaming row (e.g. persist bailed on its own guard),
  // drop it so it can't read as an interrupted turn.
  if (pendingId) await discardPendingAssistantIfEmpty(pendingId).catch(() => {});
  return { status: 200 as const, body: undefined };
}
