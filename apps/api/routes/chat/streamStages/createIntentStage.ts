/**
 * The turns that CREATE an artifact and then own the turn: board, document,
 * sheet, presentation, PDF, the sheet follow-up edit, a recurring task, and
 * sharing a document.
 *
 * The five create routes are a table rather than five if-blocks because every
 * branch had the same shape — gate on the forced tool or the classified
 * intent, resolve the referential topic, call the handler, discard the
 * placeholder row, return. Five copies of that is how the pdf branch ended up
 * as the only one missing `await cleanupPending(true)`.
 */

import {
  generateAndCreateDocument,
  handleBoardCreation,
  handlePdfCreation,
  handlePresentationCreation,
  handleRecurringTaskCreation,
  handleShareDoc,
  handleSheetCreation,
  handleSheetEdit,
} from '../services/intentExecutionService.js';
import { extractTextContent } from '../services/messageHelpers.js';
import { resolveReferentialTopic } from '../services/referentialTopic.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { type CleanupPending, type MaybeHandled, type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { Request } from 'express';

export interface CreateIntentStageParams {
  sse: SSEWriter;
  req: Request;
  classifiedState: ChatGraphState;
  aiClient: StreamContext['aiClient'];
  cleanupPending: CleanupPending;
  actualThreadId: string | undefined;
  userId: string;
  lastUserMessage: StreamContext['lastUserMessage'];
  forcedTools: string[] | undefined;
  /** Compound turns let the loop call the fat tool instead of these routes. */
  runAgentic: boolean;
  agentId: StreamBody['agentId'];
  rawDocMentionIds: StreamBody['docMentionIds'];
  rawDocumentChatIds: StreamBody['documentChatIds'];
}

export async function runCreateIntentStage({
  sse,
  req,
  classifiedState,
  aiClient,
  cleanupPending,
  actualThreadId,
  userId,
  lastUserMessage,
  forcedTools,
  runAgentic,
  agentId,
  rawDocMentionIds,
  rawDocumentChatIds,
}: CreateIntentStageParams): Promise<MaybeHandled> {
  // === Artifact-creating turns (@board/dokument/sheet/praesentation/pdf) ===
  // Every branch had the same shape — gate on the forced tool or the
  // classified intent, resolve the referential topic, call the handler,
  // discard the placeholder row, return. Five copies of that is how the pdf
  // branch ended up as the only one missing `await cleanupPending(true)`.
  const createTurnBase = {
    sse,
    classifiedState,
    aiClient,
    req,
    ...(actualThreadId != null && { actualThreadId }),
    userId,
  };
  /** What the artifact is ABOUT. A referential follow-up ("mach eine
   *  Tabelle dazu") names no subject, so the classifier resolves one against
   *  the history; `resolveReferentialTopic` covers the turns that never
   *  reached the LLM. The material to build FROM is separate and comes from
   *  runCreateTurn's transcript + source briefing. */
  const createTopic = (): string =>
    classifiedState.creationTopic ||
    resolveReferentialTopic(
      lastUserMessage ? extractTextContent(lastUserMessage.content) : '',
      classifiedState.messages ?? []
    ).text;

  const createRoutes: Array<{
    forcedTool: string;
    /** Classifier intent that also triggers it (the @-tool-only branches
     *  predate the create_* intents and have none). */
    intent?: string;
    /** Compound turns let the loop call the fat tool instead. */
    skipOnAgentic: boolean;
    run: () => Promise<boolean>;
  }> = [
    {
      forcedTool: 'board-erstellen',
      skipOnAgentic: false,
      // Board still takes the raw message: it resolves the topic itself.
      run: () => handleBoardCreation({ ...createTurnBase, lastUserMessage }),
    },
    {
      forcedTool: 'dokument-erstellen',
      skipOnAgentic: false,
      run: () =>
        generateAndCreateDocument({
          ...createTurnBase,
          userContent: createTopic(),
          intent: 'produktion',
        }),
    },
    {
      forcedTool: 'sheet-erstellen',
      intent: 'create_sheet',
      skipOnAgentic: true,
      run: () => handleSheetCreation({ ...createTurnBase, userContent: createTopic() }),
    },
    {
      forcedTool: 'praesentation-erstellen',
      intent: 'create_presentation',
      skipOnAgentic: true,
      run: () => handlePresentationCreation({ ...createTurnBase, userContent: createTopic() }),
    },
    {
      forcedTool: 'pdf-erstellen',
      intent: 'create_pdf',
      skipOnAgentic: true,
      run: () =>
        handlePdfCreation({
          ...createTurnBase,
          userContent: createTopic(),
          userLocale: classifiedState.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        }),
    },
  ];

  for (const route of createRoutes) {
    if (route.skipOnAgentic && runAgentic) continue;
    const triggered =
      forcedTools?.includes(route.forcedTool) === true ||
      (route.intent != null && classifiedState.intent === route.intent);
    if (!triggered) continue;
    if (await route.run()) {
      await cleanupPending(true);
      return { handled: true, result: { status: 200 as const, body: undefined } };
    }
  }

  // === edit_sheet intent (Tier 2.7 follow-up on a chat-created sheet) ===
  // handleSheetEdit always owns the turn once dispatched (mirrors
  // runCreateTurn's contract) — no fall-through to the normal pipeline.
  if (!runAgentic && classifiedState.intent === 'edit_sheet') {
    const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
    await handleSheetEdit({
      sse,
      classifiedState,
      ...(actualThreadId != null && { actualThreadId }),
      userId,
      userContent: lastUserText as string,
    });
    await cleanupPending(true);
    return { handled: true, result: { status: 200 as const, body: undefined } };
  }

  // === EXPERIMENTAL: create_recurring_task intent ===
  // Falls through to the normal pipeline if extraction fails.
  if (!runAgentic && classifiedState.intent === 'create_recurring_task') {
    const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
    const created = await handleRecurringTaskCreation({
      sse,
      classifiedState,
      aiClient,
      req,
      ...(actualThreadId != null && { actualThreadId }),
      userId,
      userContent: lastUserText as string,
      agentId: agentId ?? null,
      userLocale: classifiedState.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
    });
    if (created) {
      await cleanupPending(true);
      return { handled: true, result: { status: 200 as const, body: undefined } };
    }
  }

  // === Handle share_doc intent ===
  if (classifiedState.intent === 'share_doc' && actualThreadId) {
    const handled = await handleShareDoc({
      sse,
      classifiedState,
      actualThreadId,
      userId,
      ...(lastUserMessage != null && { lastUserMessage }),
      ...(rawDocMentionIds != null && { rawDocMentionIds }),
      ...(rawDocumentChatIds != null && { rawDocumentChatIds }),
    });
    if (handled) {
      await cleanupPending(true);
      return { handled: true, result: { status: 200 as const, body: undefined } };
    }
  }

  return { handled: false };
}
