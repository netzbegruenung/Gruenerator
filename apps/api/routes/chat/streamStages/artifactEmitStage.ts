/**
 * Stage 3b: what the finished answer text is turned into besides prose.
 *
 * A chart fence becomes a `chart_data` event and a complete HTML/SVG document
 * becomes an `artifact` panel. Editing the OPEN artefact is NOT here any more:
 * every editor surface now edits through the loop's `edit_document` tool
 * (boards #1735, sheets/decks, the sharepic studio #3427, docs #3428). The
 * stage used to carry a `trigger_doc_edit` emit for the docs surface, decided
 * by the classifier's `edit_current_doc` verdict; the model decides now, and
 * the tool dispatches the same event with its own instruction.
 */

import { createLogger } from '../../../utils/logger.js';
import { extractArtifactFromResponse } from '../services/artifactExtraction.js';
import { extractChartFromResponse } from '../services/confirmActionService.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('chatGraphContractRouter');

export interface ArtifactEmitStageParams {
  sse: SSEWriter;
  finalState: ChatGraphState;
  fullText: string;
}

export function runArtifactEmitStage({ sse, finalState, fullText }: ArtifactEmitStageParams): void {
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
}
