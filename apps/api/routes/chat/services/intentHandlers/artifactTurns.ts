/**
 * The thin handlers for artifact-creating turns.
 *
 * The choreography lives in createTurn.ts and the per-kind data in
 * artifactKinds.ts; everything here only names them — except save_as_doc,
 * which contributes a document to a turn it does not own
 * (see contributeDocumentToOpenTurn).
 */

import { createLogger } from '../../../../utils/logger.js';
import {
  BOARD_SPEC,
  EXPLAINABLE_SPEC,
  makeDocumentSpec,
  PDF_SPEC,
  PRESENTATION_SPEC,
  SHEET_SPEC,
} from '../artifactKinds.js';
import { emitArtifactResult, runCreateTurn, type CreateTurnOpts } from '../createTurn.js';
import { extractTextContent } from '../messageHelpers.js';
import { resolveReferentialTopic } from '../referentialTopic.js';

import type {
  ChatGraphState,
  CreatedDocument,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ModelMessage } from 'ai';

const log = createLogger('ChatGraphController');

/**
 * @board-erstellen. Unlike the others the topic is derived here: the board
 * branch predates the router-side resolution and still receives the raw
 * message.
 */
export async function handleBoardCreation(
  opts: Omit<CreateTurnOpts, 'userContent'> & { lastUserMessage: ModelMessage | undefined }
): Promise<boolean> {
  const lastUserText = opts.lastUserMessage ? extractTextContent(opts.lastUserMessage.content) : '';
  // A referential follow-up ("mach ein Board davon") names no subject; the
  // classifier resolved one against the history, with the heuristic as fallback
  // for turns that never reached the LLM.
  const userContent =
    opts.classifiedState.creationTopic ||
    resolveReferentialTopic(lastUserText, opts.classifiedState.messages ?? []).text;
  return runCreateTurn(BOARD_SPEC, { ...opts, userContent });
}

/**
 * create_sheet / @sheet-erstellen. Shape and SSE contract live in
 * runCreateTurn + SHEET_SPEC; this keeps the call-site name stable.
 */
export async function handleSheetCreation(opts: CreateTurnOpts): Promise<boolean> {
  return runCreateTurn(SHEET_SPEC, opts);
}

/** create_presentation / @praesentation-erstellen. */
export async function handlePresentationCreation(opts: CreateTurnOpts): Promise<boolean> {
  return runCreateTurn(PRESENTATION_SPEC, opts);
}

/** create_pdf / @pdf-erstellen — produces a finished, downloadable file. */
export async function handlePdfCreation(
  opts: CreateTurnOpts & { userLocale: 'de-DE' | 'de-AT' }
): Promise<boolean> {
  return runCreateTurn(PDF_SPEC, opts);
}

/** create_explainable / @explainable-erstellen — a simple-language page with
 *  illustrations that a worker paints after the turn has ended. */
export async function handleExplainableCreation(
  opts: CreateTurnOpts & { userLocale: 'de-DE' | 'de-AT' }
): Promise<boolean> {
  return runCreateTurn(EXPLAINABLE_SPEC, opts);
}

/**
 * Document creation that OWNS the turn — an ordinary entry in the artifact
 * table. save_as_doc does not own its turn; it uses
 * `contributeDocumentToOpenTurn` below.
 */
export async function generateAndCreateDocument(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
  intent: string;
}): Promise<boolean> {
  return runCreateTurn(makeDocumentSpec(documentSpecOpts(opts)), opts);
}

/**
 * save_as_doc: contribute a document to a turn somebody else owns.
 *
 * Emits the same text + card as the owning path so the chat looks identical,
 * then stops — no `done`, no message, no `sse.end()`. Returns the document
 * (null on failure) so the owning turn persists it as its `createdDocument`:
 * that metadata is what the card rehydrates from on reload, what
 * `read_artifact` resolves "the document of this conversation" from, and what
 * `deriveToolContext` turns into `last_tool_context` (#5134).
 */
export async function contributeDocumentToOpenTurn(opts: {
  sse: SSEWriter;
  req: Express.Request;
  userId: string;
  userContent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
  intent: string;
}): Promise<CreatedDocument | null> {
  const spec = makeDocumentSpec(documentSpecOpts(opts));
  const { sse, req, userId, userContent } = opts;
  try {
    const doc = await spec.generate({ req, userId, userContent, ask: userContent }, () => {});
    if (!doc) return null;

    emitArtifactResult(sse, spec, doc);
    log.info(`[ChatGraph] Document created (${spec.intent}): "${doc.title}" (${doc.documentId})`);
    return doc;
  } catch (err) {
    log.error(
      `[ChatGraph] Document creation failed (${spec.intent}): ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

function documentSpecOpts(opts: {
  intent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
}): Parameters<typeof makeDocumentSpec>[0] {
  return {
    intent: opts.intent,
    subtypeOverride: opts.subtypeOverride ?? null,
    ...(opts.conversationContext != null && { conversationContext: opts.conversationContext }),
  };
}
