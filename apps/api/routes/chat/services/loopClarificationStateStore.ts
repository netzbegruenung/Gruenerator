/**
 * Redis-Zustand einer Loop-Rückfrage (`ask_human` mitten im agentischen Zug,
 * #3220) — die Schwester des `toolApprovalStateStore`, über dieselbe Factory:
 * gleiche 24-h-TTL (die Antwort darf über Nacht kommen; der Replay wird beim
 * Fortsetzen ohnehin neu bezahlt), gleicher Ein-Fortsetzungs-Anspruch.
 *
 * NICHT der `pipelineStateStore` (10 min, Single-Pass-Resume): der kennt weder
 * `priorSteps` noch `partialText` noch die fortzuschreibende Nachricht. Welcher
 * der beiden eine ask_human-Antwort verarbeitet, entscheidet `resumePipeline`
 * am gespeicherten Zustand, nicht am Wire-Format.
 */
import { createSuspendedTurnStore, type SuspendedTurnStore } from './toolApprovalStateStore.js';

import type { PersistedStep } from './agenticLoop/types.js';
import type { StoredRequestContext } from './pipelineStateStore.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

export interface StoredLoopClarificationState {
  askTurnId: string;
  /** Der zurückgehaltene ask_human-Aufruf — wird beim Fortsetzen als
   *  beantworteter Schritt in den Replay eingespeist. */
  toolCallId: string;
  question: string;
  options?: string[];
  /** Die Schritte, die vor der Frage schon gelaufen sind — Grundlage des Replays. */
  priorSteps: PersistedStep[];
  /** Die bereits gestreamte Teilantwort. */
  partialText: string;
  /** Die Nachricht, die fortgeschrieben wird — eine Blase, nicht zwei. */
  pausedMessageId: string | null;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  createdAt: number;
}

export const loopClarificationStateStore: SuspendedTurnStore<StoredLoopClarificationState> =
  createSuspendedTurnStore<StoredLoopClarificationState>({
    prefix: 'loop_clarification_state:',
    claimPrefix: 'loop_clarification_claim:',
    label: 'Rückfrage',
  });
