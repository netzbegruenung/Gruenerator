/**
 * Wie viele Token ein Modell AUSGEBEN darf.
 *
 * Die zweite Achse neben dem Kontextfenster, und sie lässt sich daraus nicht
 * ableiten: Mistral Medium 3.5 nimmt 262k Eingabe entgegen und deckelt die
 * Ausgabe bei 16.384. Wer beides verwechselt, schickt eine Zahl, die das Modell
 * hart ablehnt — HTTP 400 `payload validation: max_completion_tokens is limited
 * to 16384 for mistral-medium-3.5-128b`, gemessen am 13.08.2026 gegen Scaleway
 * mit den 40.000 aus `config/notebookDepthProfiles.ts`.
 *
 * Es ist KEIN Host-Problem: die Mistral-API deckelt dieselben Gewichte gleich,
 * der Replay in `scalewayMistralFallbackFetch` liefe in denselben Fehler (und
 * failt bei 400 zurecht gar nicht erst über).
 *
 * Eigenes Modul, weil es zwei Aufrufer in verschiedenen Ebenen gibt — den
 * Chat-Streamer (`routes/chat/services/responseStreamingService.ts`) und den
 * agentischen Loop (`agents/langgraph/streamingProcessor.ts`), die auch ihre
 * `getModel`-Kopien nicht teilen. Eine zweite Zahlentabelle wäre genau die
 * Drift, die diese Klasse zurückbringt.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('modelOutputLimits');

/**
 * Beide Upstream-Namen desselben Modells stehen drin, weil `routeMistralModel`
 * zwischen Aufrufer und Upstream umbenennt: der Clamp greift eine Ebene ÜBER
 * dieser Umbenennung und sieht nur `mistral-medium-2604`, während dieselbe
 * Decke unter dem Scaleway-Namen gilt.
 *
 * Ein Modell OHNE Eintrag wird nicht gedeckelt — der Anbieter entscheidet dann,
 * so wie die Antwortpfade es seit #2002 ohnehin halten. Eine geratene Zahl wäre
 * in beide Richtungen falsch: zu niedrig kürzt die Antwort still, zu hoch
 * bricht den Aufruf ab.
 */
const MODEL_OUTPUT_LIMITS: Readonly<Record<string, number>> = {
  'mistral-medium-2604': 16_384,
  'mistral-medium-3.5-128b': 16_384,
};

/**
 * Die Ausgabedecke eines Modells, oder `null`, wenn keine bekannt ist.
 *
 * Nimmt den Modellnamen des Upstreams, nicht die nutzerseitige Lane-ID: die
 * Decke hängt an den Gewichten, nicht an der Lane.
 */
export function getMaxOutputTokens(modelName: string | null | undefined): number | null {
  if (!modelName) return null;
  return MODEL_OUTPUT_LIMITS[modelName] ?? null;
}

/**
 * Die Warnung feuert einmal je (Modell, angeforderte Zahl) und Prozess. Sie
 * meldet einen Konfigurationsfehler, und der ändert sich zwischen zwei Zügen
 * nicht: ungedrosselt stünde sie unter JEDER Notizbuch-Deep-Antwort und wäre
 * binnen einer Stunde unlesbar — genau das Rauschen, in dem der nächste echte
 * Befund untergeht.
 */
const warned = new Set<string>();

/**
 * Eine angeforderte Ausgabelänge auf das drosseln, was das Modell annimmt.
 *
 * Warum gekürzt und nicht abgelehnt: `max_tokens` ist eine OBERGRENZE, keine
 * Bestellmenge — auf 16.384 gekürzt schreibt das Modell dieselbe Antwort, die
 * es bei 40.000 geschrieben hätte, solange sie darunter bleibt. Ungekürzt lehnt
 * der Upstream den ganzen Aufruf ab, und zwar auf JEDEM Host derselben
 * Gewichte: der Zug ist dann tot, nicht nur gekürzt.
 */
export function clampToModelOutputLimit(
  requested: number | undefined,
  modelName: string | null | undefined,
  logPrefix = '[AI]'
): number | undefined {
  if (requested == null) return undefined;
  const limit = getMaxOutputTokens(modelName);
  if (limit === null || requested <= limit) return requested;

  const key = `${modelName}:${requested}`;
  if (!warned.has(key)) {
    warned.add(key);
    log.warn(
      `${logPrefix} maxOutputTokens ${requested} über der Decke von ${modelName} (${limit}) — gekürzt (weitere Fälle dieser Paarung werden nicht mehr gemeldet)`
    );
  }
  return limit;
}
