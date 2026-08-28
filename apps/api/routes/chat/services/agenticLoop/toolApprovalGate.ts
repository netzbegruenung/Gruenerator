import { createLogger } from '../../../../utils/logger.js';

import { evaluateApproval, type ToolApprovalMode } from './approvalPolicy.js';
import { type PendingToolCall, type ToolOrigin } from './types.js';

const log = createLogger('toolApprovalGate');

/**
 * Was das Modell zu lesen bekommt, wenn es ein abgelehntes Werkzeug erneut
 * ruft. Der Satz sagt ausdrücklich, dass es nicht noch einmal versuchen soll:
 * ein Fehlerergebnis allein ist für ein Modell eine Einladung zur Korrektur,
 * und genau die ist hier falsch.
 */
export const DENIED_RETRY_MESSAGE =
  'Die Nutzer*in hat diesen Aufruf in diesem Zug abgelehnt. Versuche ihn NICHT erneut ' +
  'und rufe auch keine Abwandlung davon auf. Erkläre stattdessen kurz, was du ohne ' +
  'dieses Werkzeug beantworten kannst.';

export type ApprovalDecision =
  /** Der Aufruf darf laufen. */
  | { kind: 'allow' }
  /** Zurückgehalten: der Zug bricht ab und fragt. NICHT ausführen. */
  | { kind: 'hold' }
  /** Schon abgelehnt: NICHT ausführen, aber auch nicht erneut fragen. */
  | { kind: 'refuse'; modelMessage: string };

export interface ToolApprovalGate {
  decide(call: {
    toolName: string;
    stepId: string;
    args: Record<string, unknown>;
  }): ApprovalDecision;
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
 *
 * `deniedScopeKeys` ist das Gegenstück und bewusst NICHT gezählt: eine
 * Ablehnung gilt für den Rest des Zuges. Sonst entsteht die Schleife, gegen die
 * sie da ist — abgelehnter Aufruf, Fehlerergebnis, das Modell versucht es
 * umformuliert erneut, das Gate fragt erneut. Der nächste Zug beginnt wieder
 * ohne Vorbelastung; abgelehnt wird eine Handlung, nicht ein Werkzeug.
 */
export function createToolApprovalGate(params: {
  mode: ToolApprovalMode;
  allowlist: ReadonlySet<string>;
  originFor: (toolName: string) => ToolOrigin | null;
  titleFor?: (toolName: string) => string | undefined;
  serverNameFor?: (toolName: string) => string | undefined;
  grantedOnce?: ReadonlyMap<string, number>;
  deniedScopeKeys?: ReadonlySet<string>;
}): ToolApprovalGate {
  const controller = new AbortController();
  const held = new Map<string, PendingToolCall>();
  const remainingGrants = new Map<string, number>(params.grantedOnce ?? []);
  const denied = params.deniedScopeKeys ?? new Set<string>();

  return {
    signal: controller.signal,
    pending: () => [...held.values()],
    hasPending: () => held.size > 0,
    decide({ toolName, stepId, args }) {
      const origin = params.originFor(toolName);
      const verdict = evaluateApproval({
        toolName,
        origin,
        allowlist: params.allowlist,
        flagEnabled: params.mode !== 'off',
      });
      if (!verdict.required) return { kind: 'allow' };

      const grants = remainingGrants.get(verdict.scopeKey) ?? 0;
      if (grants > 0) {
        remainingGrants.set(verdict.scopeKey, grants - 1);
        return { kind: 'allow' };
      }

      if (denied.has(verdict.scopeKey)) {
        log.info(`[Freigabe] ${toolName} erneut gerufen nach Ablehnung (${verdict.scopeKey})`);
        return { kind: 'refuse', modelMessage: DENIED_RETRY_MESSAGE };
      }

      // Im Schattenbetrieb wird gemessen, nicht gefragt: das Verdikt steht
      // oben, der Aufruf läuft trotzdem. Eine Zeile je Aufruf, die Serverfeld
      // und `scopeKey` trägt, damit sich hinterher auszählen lässt, welche
      // Werkzeuge wie oft fragen würden.
      if (params.mode === 'shadow') {
        log.info(
          `[Freigabe:Schatten] würde fragen — ${toolName} (${verdict.scopeKey}) Dienst=${
            params.serverNameFor?.(toolName) ?? '—'
          }`
        );
        return { kind: 'allow' };
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
      return { kind: 'hold' };
    },
  };
}
