/**
 * The thin handlers for artifact-creating turns.
 *
 * The choreography lives in createTurn.ts and the per-kind data in
 * artifactKinds.ts; everything here only names them — except the two document
 * modes, whose fork is genuinely different (see generateAndCreateDocument).
 */

import { createLogger } from '../../../../utils/logger.js';
import {
  BOARD_SPEC,
  makeDocumentSpec,
  PDF_SPEC,
  PRESENTATION_SPEC,
  SHEET_SPEC,
} from '../artifactKinds.js';
import { emitArtifactResult, runCreateTurn, type CreateTurnOpts } from '../createTurn.js';
import { rememberArtifact } from '../createTurnHelpers.js';
import { extractTextContent } from '../messageHelpers.js';
import { resolveReferentialTopic } from '../referentialTopic.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
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

/**
 * Document creation, in two genuinely different modes.
 *
 * The default mode OWNS the turn and is an ordinary entry in the artifact
 * table. `skipTerminate` (save_as_doc) does NOT: it writes the card and text
 * into a stream its caller already opened and will close, so it deliberately
 * emits no `done`, persists no message and returns false on failure to let the
 * caller decide. Keeping the fork explicit at the top beats the previous
 * version, where `if (!skipTerminate)` was threaded through 167 lines.
 */
export async function generateAndCreateDocument(opts: {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  aiClient: ChatGraphState['aiClient'];
  req: Express.Request;
  actualThreadId?: string;
  userId: string;
  userContent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
  intent: string;
  skipTerminate?: boolean;
}): Promise<boolean> {
  const spec = makeDocumentSpec({
    intent: opts.intent,
    subtypeOverride: opts.subtypeOverride ?? null,
    ...(opts.conversationContext != null && { conversationContext: opts.conversationContext }),
  });
  if (!opts.skipTerminate) return runCreateTurn(spec, opts);
  return contributeDocumentToOpenTurn(spec, opts);
}

/**
 * save_as_doc: contribute a document to a turn somebody else owns.
 *
 * Emits the same text + card as the owning path so the chat looks identical,
 * remembers the artifact (this path never reaches persistAssistantResponse's
 * deriveToolContext, so without it the follow-up edit gate has no target), and
 * then stops — no `done`, no message, no `sse.end()`.
 */
async function contributeDocumentToOpenTurn(
  spec: ReturnType<typeof makeDocumentSpec>,
  opts: CreateTurnOpts
): Promise<boolean> {
  const { sse, aiClient, req, userId, userContent, actualThreadId } = opts;
  try {
    const doc = await spec.generate({ aiClient, req, userId, userContent }, () => {});
    if (!doc) return false;

    emitArtifactResult(sse, spec, doc);
    log.info(`[ChatGraph] Document created (${spec.intent}): "${doc.title}" (${doc.documentId})`);

    const contextKind =
      typeof spec.contextKind === 'function' ? spec.contextKind(doc) : spec.contextKind;
    await rememberArtifact(actualThreadId, contextKind, doc.documentId, doc.title);
    return true;
  } catch (err) {
    log.error(
      `[ChatGraph] Document creation failed (${spec.intent}): ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}
