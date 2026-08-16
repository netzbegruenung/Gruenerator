/**
 * Stage 1 — classify the turn.
 *
 * Runs the classifier node over the initialized state and attaches the two
 * routing signals the classifier itself does not produce: the sanitized user
 * text and the turn's output contract (`taskShape`).
 */

import { classifierNode } from '../../../agents/langgraph/ChatGraph/index.js';
import { createLogger } from '../../../utils/logger.js';
import { detectTaskShape } from '../agents/taskShape.js';
import { extractTextContent } from '../services/messageHelpers.js';
import { sendChatWarning, type SSEWriter } from '../services/sseHelpers.js';

import { type InitialState } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

const log = createLogger('chatGraphContractRouter');

export interface ClassifyStageParams {
  initialState: InitialState;
  validMessages: StreamContext['validMessages'];
  /** Last user message with mention tokens removed — labels like "Bild
   *  generieren" would false-positive the shape heuristics. */
  lastUserTextNoMentions: string;
  sse: SSEWriter;
}

export async function runClassifyStage({
  initialState,
  validMessages,
  lastUserTextNoMentions,
  sse,
}: ClassifyStageParams): Promise<ChatGraphState> {
  const classifiedState = {
    ...initialState,
    ...(await classifierNode(initialState)),
  } as ChatGraphState;
  classifiedState.lastUserTextNoMentions = lastUserTextNoMentions;
  // Third routing signal next to intent and complexity: the output
  // contract the user attached to the turn (JSON/code, "genau N Sätze").
  // The previous assistant answer feeds the sticky case — a short edit
  // follow-up after a code/JSON answer carries no format signal of its own.
  classifiedState.taskShape = detectTaskShape(lastUserTextNoMentions, {
    lastAssistantText:
      [...validMessages]
        .reverse()
        .filter((m) => m.role === 'assistant')
        .map((m) => extractTextContent(m.content))
        .find((t) => t.trim().length > 0) ?? null,
  });
  if (classifiedState.taskShape) {
    log.info(`[ChatGraph] taskShape=${classifiedState.taskShape} detected`);
  }
  // The heuristic fallback produces a materially worse turn (no
  // multi-source search, no metadata filters) that used to look normal.
  if (classifiedState.classifierDegraded) sendChatWarning(sse, 'classifier_degraded');

  return classifiedState;
}
