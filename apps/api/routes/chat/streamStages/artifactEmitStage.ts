/**
 * Stages 3b–3c: what the finished answer text is turned into besides prose.
 *
 * A chart fence becomes a `chart_data` event, a complete HTML/SVG document
 * becomes an `artifact` panel, and a DOCS editor-surface turn emits the
 * `trigger_doc_edit` event its frontend needs. ChatGraph never edits the doc
 * itself — it classifies and forwards. Every other editor surface is tool-based
 * (boards #1735, sheets/decks, the sharepic studio #3427): the loop's
 * `edit_document` tool plans ops server-side and streams `editor_operations`
 * directly, with no trigger event from this stage.
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
  editTarget: 'doc' | 'board' | 'canvas' | null;
  /** In-loop `edit_document` already handled the edit — skip the legacy
   *  trigger round-trip. */
  editToolLoop: boolean;
  rawCurrentDocument: StreamBody['currentDocument'];
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
}
