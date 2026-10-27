import { createLogger } from '../../../../utils/logger.js';

import { type PendingClientToolRequest } from './types.js';

const log = createLogger('clientToolGate');

type HeldCall = { toolName: string; stepId: string; args: Record<string, unknown> };

export type ClientToolRequestResolver = (
  call: HeldCall
) => Promise<{ clientToolName: string; clientArgs: Record<string, unknown> } | { error: string }>;

export interface ClientToolGate {
  /** Hält den Aufruf an und bricht den Zug ab. `error` ⇒ nicht gehalten, das Modell erfährt warum. */
  hold(call: HeldCall): Promise<{ error: string } | null>;
  /**
   * Setzt einen schon aufgelösten Aufruf aus einer Freigabe-Pause wieder ein
   * (#5044) und bricht den Zug ab wie `hold`. `false` ⇒ ein anderer Aufruf
   * hält schon, der wiedereingesetzte entfällt.
   */
  restore(held: PendingClientToolRequest): boolean;
  pending(): PendingClientToolRequest | null;
  hasPending(): boolean;
  signal: AbortSignal;
}

const WAITING = { error: 'Warte auf die Darstellung im Browser.' };

/**
 * Schwester des `askHumanGate` für Loop-Werkzeuge, die der Browser ausführt
 * (`check_sharepic` → `render_sharepic`). Dieselbe Abbruch-Mechanik: das Signal,
 * nicht eine Ausnahme, weil `gather()` jeden Fehler fängt. Was der Browser
 * bekommt, löst `resolve` erst beim Halten auf (Ziel-Sharepic aus der DB) —
 * scheitert das, geht der Fehler als normales Tool-Ergebnis ans Modell und der
 * Zug läuft weiter. Die ERSTE Anforderung gewinnt, der Client führt eine aus.
 */
export function createClientToolGate(resolve: ClientToolRequestResolver): ClientToolGate {
  const controller = new AbortController();
  let held: PendingClientToolRequest | null = null;

  return {
    signal: controller.signal,
    pending: () => held,
    hasPending: () => held != null,
    restore(call) {
      if (held) return false;
      held = call;
      log.info(
        `[Client-Tool] ${call.toolName} aus der Freigabe-Pause wieder eingesetzt, Browser führt ${call.clientToolName} aus`
      );
      controller.abort();
      return true;
    },
    async hold(call) {
      if (held) return WAITING;
      const resolved = await resolve(call);
      if ('error' in resolved) return { error: resolved.error };
      // Ein Geschwister-Aufruf kann während des Auflösens gewonnen haben.
      if (held) return WAITING;
      held = {
        toolCallId: call.stepId,
        toolName: call.toolName,
        args: call.args,
        clientToolName: resolved.clientToolName,
        clientArgs: resolved.clientArgs,
      };
      log.info(
        `[Client-Tool] ${call.toolName} zurückgehalten, Browser führt ${held.clientToolName} aus`
      );
      controller.abort();
      return null;
    },
  };
}
