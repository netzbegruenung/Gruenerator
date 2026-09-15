import { createLogger } from '../../../../utils/logger.js';

import { evaluateApproval } from './approvalPolicy.js';
import { type PendingToolCall, type ToolOrigin } from './types.js';

const log = createLogger('toolApprovalGate');

export interface ToolApprovalGate {
  /**
   * `true` ⇒ der Aufruf wurde zurückgehalten; der Zug bricht ab und fragt.
   * Der Aufrufer darf das Werkzeug dann NICHT ausführen.
   */
  hold(call: { toolName: string; stepId: string; args: Record<string, unknown> }): boolean;
  pending(): PendingToolCall[];
  hasPending(): boolean;
  /** Bricht den Loop ab, sobald der erste Aufruf zurückgehalten wurde. */
  signal: AbortSignal;
}

/**
 * Das Gate hält den Aufruf nur an und merkt ihn vor — abgebrochen wird über das
 * Signal, nicht über eine Ausnahme: `gather()` fängt jeden Fehler und würde
 * danach trotzdem synthetisieren (siehe `loopEngine`).
 *
 * `grantedOnce` trägt die Einmal-Freigaben der Fortsetzung, gezählt statt
 * gesetzt: dieselbe Person kann dasselbe Werkzeug in einem Zug zweimal
 * freigeben, und die zweite Freigabe darf die erste nicht mitverbrauchen.
 */
export function createToolApprovalGate(params: {
  enabled: boolean;
  allowlist: ReadonlySet<string>;
  originFor: (toolName: string) => ToolOrigin | null;
  titleFor?: (toolName: string) => string | undefined;
  serverNameFor?: (toolName: string) => string | undefined;
  grantedOnce?: ReadonlyMap<string, number>;
}): ToolApprovalGate {
  const controller = new AbortController();
  const held = new Map<string, PendingToolCall>();
  const remainingGrants = new Map<string, number>(params.grantedOnce ?? []);

  return {
    signal: controller.signal,
    pending: () => [...held.values()],
    hasPending: () => held.size > 0,
    hold({ toolName, stepId, args }) {
      const origin = params.originFor(toolName);
      const verdict = evaluateApproval({
        toolName,
        origin,
        allowlist: params.allowlist,
        flagEnabled: params.enabled,
      });
      if (!verdict.required) return false;

      const grants = remainingGrants.get(verdict.scopeKey) ?? 0;
      if (grants > 0) {
        remainingGrants.set(verdict.scopeKey, grants - 1);
        return false;
      }

      // Geschwister-Aufrufe desselben Model-Steps laufen nebenläufig: der erste
      // bricht ab, die übrigen sammeln sich noch ein und werden mitgefragt.
      held.set(stepId, {
        toolCallId: stepId,
        toolName,
        args,
        scopeKey: verdict.scopeKey,
        ...(params.titleFor?.(toolName) ? { title: params.titleFor(toolName) as string } : {}),
        ...(params.serverNameFor?.(toolName)
          ? { serverName: params.serverNameFor(toolName) as string }
          : {}),
      });
      log.info(`[Freigabe] ${toolName} zurückgehalten (${verdict.scopeKey})`);
      controller.abort();
      return true;
    },
  };
}
