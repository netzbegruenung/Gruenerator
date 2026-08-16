/**
 * Stages 3b–3d: what the finished answer text is turned into besides prose.
 *
 * A chart fence becomes a `chart_data` event, a complete HTML/SVG document
 * becomes an `artifact` panel, and an editor-surface turn emits the
 * trigger event its frontend needs. ChatGraph never edits the doc or board
 * itself — it classifies and forwards.
 */

import { createLogger } from '../../../utils/logger.js';
import { extractArtifactFromResponse } from '../services/artifactExtraction.js';
import { extractChartFromResponse } from '../services/confirmActionService.js';
import { extractTextContent } from '../services/messageHelpers.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { buildEditReferenceContent } from './editReference.js';
import { type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { ModelMessage } from 'ai';

const log = createLogger('chatGraphContractRouter');

export interface ArtifactEmitStageParams {
  sse: SSEWriter;
  finalState: ChatGraphState;
  fullText: string;
  validMessages: StreamContext['validMessages'];
  lastUserMessage: StreamContext['lastUserMessage'];
  /** The loop-then-edit variant: this turn's gathered sources become the
   *  edit's reference material instead of a prior assistant turn. */
  compoundEdit: boolean;
  editTarget: 'doc' | 'board' | null;
  /** In-loop `edit_document` already handled the edit — skip the legacy
   *  trigger round-trip. */
  editToolLoop: boolean;
  rawCurrentDocument: StreamBody['currentDocument'];
  rawCurrentBoard: StreamBody['currentBoard'];
}

export function runArtifactEmitStage({
  sse,
  finalState,
  fullText,
  validMessages,
  lastUserMessage,
  compoundEdit,
  editTarget,
  editToolLoop,
  rawCurrentDocument,
  rawCurrentBoard,
}: ArtifactEmitStageParams): void {
  // === Stage 3b: Extract chart data from response (if chart intent) ===
  if (finalState.intent === 'chart') {
    const chartData = extractChartFromResponse(fullText);
    if (chartData) {
      sse.send('chart_data', { chart: chartData });
      log.info(
        `[ChatGraph] Chart data extracted: ${chartData.type} with ${chartData.data.length} points`
      );
    }
  }

  // === Stage 3b': Extract generic artifact (HTML/SVG) from response ===
  // Explicit `artifact` intent → surface any valid block. Any other intent
  // → auto-detect, but only a *complete* HTML/SVG document (not an
  // illustrative snippet), so a normal answer with an example ```html block
  // doesn't spuriously dock a panel. Skip `chart` (own ```chart fence).
  if (finalState.intent !== 'chart') {
    const artifact = extractArtifactFromResponse(fullText, {
      isArtifactIntent: finalState.intent === 'artifact',
    });
    if (artifact) {
      sse.send('artifact', { artifact });
      log.info(
        `[ChatGraph] Artifact extracted: ${artifact.type} (${artifact.content.length} chars)`
      );
    }
  }

  // === Stage 3c: Live document edit trigger (docs editor surface only) ===
  // For edit_current_doc intent, emit a `trigger_doc_edit` SSE event with
  // the user's prompt + selection flag. The docs-editor frontend dispatches
  // this into BlockNote's AIExtension.invokeAI(), which runs the existing
  // /api/docs/ai pipeline (tool calls → applyDocumentOperations → Yjs sync).
  // ChatGraph never edits the doc itself — it just classifies and forwards.
  //
  // Reference content channel: short referential commands like "füge dies
  // ein" or "im dokument einfügen" point at the previous assistant turn
  // (the rewritten Antrag the chat produced earlier). BlockNote AI sees
  // only the document — not chat history. We forward the prior substantive
  // assistant message as a SEPARATE `referenceContent` field; it lands in
  // the docs-AI route's *system prompt* as labeled instructional context,
  // never concatenated into userPrompt (an earlier attempt did that and
  // the model inserted the wrapper text verbatim into the document).
  //
  // "Substantive" = ≥200 chars, which skips the brief edit-confirmation
  // ("Ich passe das Dokument an…") that respondNode itself just emitted
  // and lands on the earlier turn that actually contains the content.
  // compoundEdit (research + edit) forces this even when the intent isn't
  // edit_current_doc: the research loop just ran, and its gathered sources
  // become the reference material (instead of a prior assistant turn).
  // NOTE: the CANVAS (sharepic editor) also rides this path — it sets
  // customEnabledTools.edit_current_doc and sends currentDocument.id = docKey,
  // so a canvas edit dispatches trigger_doc_edit here too (its handler calls
  // /api/canvas/ai-suggest). Don't add doc-only assumptions under this branch
  // without also checking resolveEditorSurfaceKind !== 'canvas'.
  if (
    !editToolLoop &&
    (finalState.intent === 'edit_current_doc' || (compoundEdit && editTarget === 'doc')) &&
    rawCurrentDocument?.id
  ) {
    const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
    const referenceContent = buildEditReferenceContent(
      compoundEdit,
      finalState.searchResults,
      validMessages as ModelMessage[],
      lastUserMessage as ModelMessage | undefined
    );
    const hasSelection = !!rawCurrentDocument.selectionText;
    sse.send('trigger_doc_edit', {
      targetDocumentId: rawCurrentDocument.id,
      userPrompt: lastUserText,
      useSelection: hasSelection,
      ...(referenceContent.trim() ? { referenceContent } : {}),
    });
    log.info(
      `[ChatGraph] Emitted trigger_doc_edit for doc ${rawCurrentDocument.id} (selection: ${hasSelection}, compoundEdit: ${compoundEdit}, refContentChars: ${referenceContent.length})`
    );
  }

  // === Stage 3d: Live board edit trigger (boards editor surface only) ===
  // For edit_current_board intent, emit a `trigger_board_action` SSE event
  // with the user's prompt. The boards-editor frontend calls POST
  // /api/boards/:id/ai to plan operations, then applies them to the live
  // Yjs board. ChatGraph never edits the board itself — classify + forward.
  if (
    !editToolLoop &&
    (finalState.intent === 'edit_current_board' || (compoundEdit && editTarget === 'board')) &&
    rawCurrentBoard?.id
  ) {
    const lastUserText = lastUserMessage ? extractTextContent(lastUserMessage.content) : '';
    const referenceContent = buildEditReferenceContent(
      compoundEdit,
      finalState.searchResults,
      validMessages as ModelMessage[],
      lastUserMessage as ModelMessage | undefined
    );
    sse.send('trigger_board_action', {
      targetBoardId: rawCurrentBoard.id,
      userPrompt: lastUserText,
      ...(referenceContent.trim() ? { referenceContent } : {}),
    });
    log.info(
      `[ChatGraph] Emitted trigger_board_action for board ${rawCurrentBoard.id} (compoundEdit: ${compoundEdit}, refContentChars: ${referenceContent.length})`
    );
  }
}
