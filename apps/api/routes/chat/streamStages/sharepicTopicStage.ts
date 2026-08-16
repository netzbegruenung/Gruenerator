/**
 * HITL gate: a sharepic with no subject.
 *
 * Unlike the generic clarification this fires even for a forced @sharepic,
 * because a bare "@sharepic" / "zitat sharepic" has the intent but no topic.
 */

import { createLogger } from '../../../utils/logger.js';
import { resolveReferentialTopic } from '../services/referentialTopic.js';
import { isSharepicTopicMissing } from '../services/sharepicVariantHelpers.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { type SharepicRefinement } from './earlyHandlerStage.js';
import { suspendTurn, type SuspendTurnBase } from './turnEnd.js';
import { type MaybeHandled } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('chatGraphContractRouter');

export interface SharepicTopicStageParams {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  suspendBase: SuspendTurnBase;
  forcedTool: boolean;
  actualThreadId: string | undefined;
  sharepicRefinement: SharepicRefinement | undefined;
  lastUserTextNoMentions: string;
}

export async function runSharepicTopicStage({
  sse,
  classifiedState,
  suspendBase,
  forcedTool,
  actualThreadId,
  sharepicRefinement,
  lastUserTextNoMentions,
}: SharepicTopicStageParams): Promise<MaybeHandled> {
  // === HITL: Sharepic without a topic → ask before generating ===
  // Unlike the generic clarification above this fires even for forced @sharepic,
  // because a bare "@sharepic" / "zitat sharepic" has the intent but no subject.
  if (classifiedState.intent === 'sharepic' && actualThreadId && !sharepicRefinement) {
    const sharepicText = lastUserTextNoMentions;
    // Ask only when the THREAD has no subject either. "Jetzt noch ein
    // normales sharepic" carries none of its own, but the turn before it
    // does — and runSharepicGeneration resolves exactly that. Asking here
    // would throw away a topic the pipeline already knows. Both resolution
    // paths count, in the order the generator tries them.
    const topicResolvable =
      !!classifiedState.creationTopic ||
      resolveReferentialTopic(sharepicText as string, classifiedState.messages ?? []).inherited;
    if (isSharepicTopicMissing(sharepicText as string) && !topicResolvable) {
      log.info('[ChatGraph] Sharepic topic missing — asking user for the topic');

      const stepId = `clarify_${Date.now()}`;
      const question = 'Zu welchem Thema soll ich das Sharepic erstellen?';
      const options = ['Klimaschutz', 'Soziale Gerechtigkeit', 'Verkehrswende', 'Artenschutz'];

      sse.sendRaw('thinking_step', {
        stepId,
        toolName: 'ask_human',
        title: 'Stelle Klärungsfrage...',
        status: 'in_progress',
        args: { question, options },
      });

      const suspended = await suspendTurn({
        ...suspendBase,
        forcedTool,
        threadId: actualThreadId,
        interrupt: {
          interruptType: 'clarification',
          question,
          options,
          threadId: actualThreadId,
        },
      });
      return { handled: true, result: suspended };
    }
  }

  return { handled: false };
}
