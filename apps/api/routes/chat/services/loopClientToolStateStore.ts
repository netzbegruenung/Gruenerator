/**
 * Redis-Zustand eines Loop-Werkzeugs, das auf den Browser wartet
 * (`check_sharepic` → `render_sharepic`) — die Schwester des
 * `loopClarificationStateStore`, über dieselbe Factory und mit denselben
 * Garantien (24-h-TTL, Ein-Fortsetzungs-Anspruch).
 *
 * NICHT der `pipelineStateStore`: der gehört der Pre-Loop-Pause (`run_python`)
 * und kennt weder `priorSteps` noch die fortzuschreibende Nachricht. Welcher
 * der beiden ein `client_tool`-Ergebnis verarbeitet, entscheidet
 * `resumePipeline` am gespeicherten Zustand.
 */
import { createSuspendedTurnStore, type SuspendedTurnStore } from './toolApprovalStateStore.js';

import type { PersistedStep } from './agenticLoop/types.js';
import type { StoredRequestContext } from './pipelineStateStore.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

export interface StoredLoopClientToolState {
  clientToolTurnId: string;
  /** Der zurückgehaltene Loop-Aufruf — bekommt beim Fortsetzen sein Ergebnis. */
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Das Browser-Werkzeug, auf dessen Ergebnis gewartet wird. */
  clientToolName: string;
  clientArgs: Record<string, unknown>;
  priorSteps: PersistedStep[];
  partialText: string;
  pausedMessageId: string | null;
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  /** Die vor dieser Pause aufgelöste Pause (z. B. die entschiedene Freigabe) —
   *  wird in jede weitere Persistenz des Zuges übernommen. */
  resolvedPause?: Record<string, unknown>;
  createdAt: number;
}

export const loopClientToolStateStore: SuspendedTurnStore<StoredLoopClientToolState> =
  createSuspendedTurnStore<StoredLoopClientToolState>({
    prefix: 'loop_client_tool_state:',
    claimPrefix: 'loop_client_tool_claim:',
    label: 'Browser-Werkzeug',
  });
