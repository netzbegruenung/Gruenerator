/**
 * Ein Ausfall des Cross-Encoders, einmal je Turn sichtbar gemacht.
 *
 * Der Einzelpfad bindet `rerank_degraded` an einen Turn
 * (`intentHandlers/searchBranch.ts:262`, `services/resumePipeline.ts:495`); im
 * Loop kann derselbe Ausfall bis zu sechs Werkzeugaufrufe treffen
 * (`MAX_SEARCH_CALLS`, `loopGuards.ts:98`). Gewarnt wird deshalb beim ERSTEN
 * Fehlschlag und danach nicht mehr — die Antwort ist inhaltlich nicht falsch,
 * nur schlechter sortiert.
 *
 * Der Marker kommt als `rerankDegraded` am Werkzeugergebnis an (gesetzt in
 * `directSearchExecutors.ts`, durchgereicht aus `SearchResponse.metadata`).
 * `afterToolCall` sieht das UNGEKÜRZTE Ergebnis — der persistierte Schritt
 * bleibt roh (Karte, Fehlersuche). Das Modell sieht das Feld an zwei Stellen
 * nie: `stripInternalFields` in `wrapTools.ts` entfernt es aus der Antwort des
 * laufenden Aufrufs, und dieselbe Funktion entfernt es erneut in `mcpReplay.ts`
 * (`shortValue`), wenn derselbe persistierte Schritt einen Turn später
 * repliziert wird.
 *
 * Eine Instanz je Turn — der Zähler ist eine Closure, wie die Guards daneben.
 */
import { createLogger } from '../../../../utils/logger.js';
import { sendChatWarning, type SSEWriter } from '../sseHelpers.js';

import type { ToolHooks } from './wrapTools.js';

const log = createLogger('agenticRerank');

export function createRerankDegradedHook(sse: SSEWriter): {
  afterToolCall: NonNullable<ToolHooks['afterToolCall']>;
} {
  let warned = false;

  return {
    afterToolCall: (event) => {
      if (warned) return;
      const result = event.result;
      if (!result || typeof result !== 'object') return;
      if ((result as { rerankDegraded?: unknown }).rerankDegraded !== true) return;

      warned = true;
      log.warn(
        `[Agentic] Chunk-Rerank degradiert in ${event.toolName} — Reihenfolge wie ohne Cross-Encoder`
      );
      sendChatWarning(sse, 'rerank_degraded');
    },
  };
}
