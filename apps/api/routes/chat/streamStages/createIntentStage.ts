/**
 * The turns that CREATE an artifact and then own the turn: board, document,
 * sheet, presentation, PDF, the sheet follow-up edit, and sharing a document.
 * (A recurring task is no longer one of them — since 09/2026 the loop tool
 * `recurring_tasks` owns it, with a confirm card.)
 *
 * The five create routes are a table rather than five if-blocks because every
 * branch had the same shape — gate on the forced tool or the classified
 * intent, resolve the referential topic, call the handler, discard the
 * placeholder row, return. Five copies of that is how the pdf branch ended up
 * as the only one missing `await cleanupPending(true)`.
 */

import {
  artifactKind,
  skipsOnAgenticForKind,
  type ArtifactKindId,
} from '../services/artifactKindRegistry.js';
import {
  generateAndCreateDocument,
  handleBoardCreation,
  handlePdfCreation,
  handlePresentationCreation,
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
  cleanupPending: CleanupPending;
  actualThreadId: string | undefined;
  userId: string;
  lastUserMessage: StreamContext['lastUserMessage'];
  forcedTools: string[] | undefined;
  /** Compound turns let the loop call the fat tool instead of these routes. */
  runAgentic: boolean;
  rawDocMentionIds: StreamBody['docMentionIds'];
  rawDocumentChatIds: StreamBody['documentChatIds'];
}

export async function runCreateIntentStage({
  sse,
  req,
  classifiedState,
  cleanupPending,
  actualThreadId,
  userId,
  lastUserMessage,
  forcedTools,
  runAgentic,
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

  /**
   * The create routes, in DISPATCH order — deliberately not the registry's
   * detection order. Two rows can both match one turn (`@board-erstellen` on a
   * turn the classifier called `create_sheet`), and then the first one wins, so
   * this sequence is behaviour.
   *
   * Only the `run` closures are written out here. Everything else — the F0
   * mention token, the classifier intent, and whether a compound turn hands the
   * job to the loop instead — is READ from the registries that already declare
   * it: `ARTIFACT_CREATE_TOKENS` / `CHAT_INTENTS` in
   * `@gruenerator/shared/chat-intents` for the two intent-bearing columns, and
   * the artifact-kind registry for the token. They used to be re-typed here,
   * which made this the second writer of an F0 string set and a third writer of
   * `skipOnAgentic`.
   */
  const createRoutes: Array<{
    kind: ArtifactKindId;
    run: () => Promise<boolean>;
  }> = [
    {
      kind: 'board',
      // Board still takes the raw message: it resolves the topic itself.
      run: () => handleBoardCreation({ ...createTurnBase, lastUserMessage }),
    },
    {
      kind: 'document',
      run: () =>
        generateAndCreateDocument({
          ...createTurnBase,
          userContent: createTopic(),
          intent: 'produktion',
        }),
    },
    {
      kind: 'sheet',
      run: () => handleSheetCreation({ ...createTurnBase, userContent: createTopic() }),
    },
    {
      kind: 'presentation',
      run: () => handlePresentationCreation({ ...createTurnBase, userContent: createTopic() }),
    },
    {
      kind: 'pdf',
      run: () =>
        handlePdfCreation({
          ...createTurnBase,
          userContent: createTopic(),
          userLocale: classifiedState.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        }),
    },
  ];

  for (const route of createRoutes) {
    const { mentionToken, intent } = artifactKind(route.kind);
    if (skipsOnAgenticForKind(route.kind) && runAgentic) continue;
    const triggered =
      (mentionToken != null && forcedTools?.includes(mentionToken) === true) ||
      (intent != null && classifiedState.intent === intent);
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
