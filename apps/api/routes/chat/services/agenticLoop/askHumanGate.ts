import { createLogger } from '../../../../utils/logger.js';

import { type PendingAskRequest } from './types.js';

const log = createLogger('askHumanGate');

export interface AskHumanGate {
  /** Hält die Rückfrage an und bricht den Zug über das Signal ab. */
  hold(call: { stepId: string; args: Record<string, unknown> }): void;
  pending(): PendingAskRequest | null;
  hasPending(): boolean;
  /** Bricht den Loop ab, sobald die erste Rückfrage zurückgehalten wurde. */
  signal: AbortSignal;
}

/**
 * Das Gegenstück zum `toolApprovalGate` für die `ask_human`-Rückfrage — bewusst
 * ein eigenes, kleines Gate statt einer Verallgemeinerung: dort entscheidet
 * eine Policy über fremde Werkzeuge (scopeKey, Allowlist, Einmal-Freigaben),
 * hier gibt es genau eine Frage und keine Policy. Abgebrochen wird wie dort
 * über das Signal, nicht über eine Ausnahme: `gather()` fängt jeden Fehler und
 * würde danach trotzdem synthetisieren (siehe `loopEngine`).
 *
 * Die ERSTE Frage gewinnt: Geschwister-Aufrufe desselben Model-Steps laufen
 * nebenläufig, und eine zweite Frage im selben Zug hätte keine Karte — der
 * Client rendert genau eine Klärung.
 */
export function createAskHumanGate(): AskHumanGate {
  const controller = new AbortController();
  let held: PendingAskRequest | null = null;

  return {
    signal: controller.signal,
    pending: () => held,
    hasPending: () => held != null,
    hold({ stepId, args }) {
      if (held) return;
      const question =
        typeof args.question === 'string' && args.question.trim().length > 0
          ? args.question.trim()
          : 'Kannst du deine Anfrage präzisieren?';
      const options = Array.isArray(args.options)
        ? args.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
        : [];
      held = {
        toolCallId: stepId,
        question,
        ...(options.length >= 2 ? { options } : {}),
      };
      log.info(`[Rückfrage] zurückgehalten: "${question.slice(0, 80)}"`);
      controller.abort();
    },
  };
}
