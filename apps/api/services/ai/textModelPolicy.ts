/**
 * Welche Text-/Chat-Modelle der Grünerator nicht bedient — und warum das eine
 * eigene Datei ist statt einer Zeile im Provider-Default.
 *
 * ── Was hier geregelt wird ──
 *
 * Chinesische Text- und Chatmodelle (Qwen, GLM/Zhipu, Kimi/Moonshot, MiniMax,
 * DeepSeek) beantworten keine Nutzeranfragen. Der Grünerator ist ein Werkzeug
 * einer deutschen Partei; welches Modell einen politischen Text schreibt oder
 * eine Anfrage einordnet, ist keine reine Qualitätsfrage.
 *
 * ── Was hier AUSDRÜCKLICH NICHT geregelt wird ──
 *
 * **Bild und Rerank bleiben.** `Qwen-Image` (`services/flux/RegoloImageService.ts`)
 * und `Qwen3-Reranker-4B` (`services/search/GreenPTRerankService.ts` mit
 * `RegoloRerankService.ts` als Rückfall — dieselben Gewichte, zwei Hosts) sind
 * bewusst weiter im Einsatz: das eine ist eine ausgewiesene Modellwahl im UI,
 * das andere sortiert Suchtreffer und formuliert nichts. Beide laufen über
 * eigene Services und NICHT über `getModel`, werden von dieser Datei also gar
 * nicht berührt — der Test daneben hält das fest, damit eine spätere
 * Verschärfung sie nicht versehentlich mitnimmt.
 *
 * ── Warum eine Sperre und nicht nur ein anderer Default ──
 *
 * Der Regolo-Default stand auf `qwen3.5-122b`, und zwar an drei Stellen, aus
 * einer Env-Variablen. Er war damit an zwei Stellen wirksam, die niemand
 * gewählt hat:
 *
 *   1. `getFallbackModelForProvider` (providerFallback.ts) gibt schlicht
 *      `getDefaultModel(provider)` zurück, und die Fallback-Kette lautet
 *      `litellm → regolo → mistral`. JEDE Anfrage, deren Primär-Provider
 *      ausfällt oder leer antwortet, landete also auf Qwen — obwohl
 *      `routes/chat/agents/providers.ts` ausdrücklich notiert „never
 *      auto-route INTO Qwen". Die Absicht stand da, die Mechanik tat das
 *      Gegenteil.
 *   2. `execute.ts` nimmt `options.model || getDefaultModel(provider)`, ein
 *      Aufrufer ohne Modellnamen bekam also dasselbe.
 *
 * Ein geänderter Default allein würde das beheben und beim nächsten Setzen von
 * `REGOLO_DEFAULT_MODEL=qwen…` still zurückfallen. Deshalb prüft
 * `regoloTextDefault` den Env-Wert, statt ihm zu vertrauen: ein gesperrtes
 * Modell wird laut protokolliert und verworfen, nicht übernommen. Genau dieser
 * Fall ist heute produktiv — in `.env` steht `REGOLO_DEFAULT_MODEL=qwen3.5-122b`.
 * Die Zeile wird damit wirkungslos und darf weg; bis dahin greift die Sperre.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('TextModelPolicy');

/**
 * Gesperrte Text-/Chat-Modellfamilien.
 *
 * Bewusst auf Familien-Präfixen statt auf vollen IDs: die Anbieter benennen
 * Punktversionen um (`qwen3.5-122b`, `qwen3.6-27b`, `qwen3.5-9b`), und eine
 * Liste voller IDs wäre am Tag nach dem nächsten Release unvollständig.
 *
 * `Qwen-Image` und `Qwen3-Reranker-4B` matchen hier ebenfalls — das ist
 * ungefährlich, weil diese Funktion NUR auf dem Text-Modellpfad aufgerufen
 * wird. Bild und Rerank haben eigene Services und kommen hier nie an.
 */
const EXCLUDED_TEXT_MODEL = /(^|[^a-z])(qwen|glm|kimi|minimax|deepseek|yi-|baichuan|internlm)/i;

export function isExcludedTextModel(model: string): boolean {
  return EXCLUDED_TEXT_MODEL.test(model);
}

/**
 * Der benannte Regolo-Standard für Text.
 *
 * Gemma 4, weil es ohnehin die gesamte deutsche Textlast trägt (`TEXT_MODEL` in
 * providerSelector.ts, Synth-Slot des Chat-Loops) und auf demselben Host liegt.
 * Ein Fallback, der auf ein bereits produktives Modell zeigt, ist genau das,
 * was ein Fallback sein soll.
 */
export const REGOLO_TEXT_DEFAULT = 'gemma4-31b';

const warned = new Set<string>();

/**
 * Regolos Text-Standardmodell: der Env-Wert, sofern er zulässig ist, sonst
 * `REGOLO_TEXT_DEFAULT`.
 *
 * Nie ein leerer Modellname — Regolo entscheidet dann selbst, welches Modell
 * antwortet, und das ist genau die Auto-Auswahl, die hier nicht stattfinden
 * soll. Jede Anfrage benennt ihr Modell.
 */
export function regoloTextDefault(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.REGOLO_DEFAULT_MODEL;
  if (!configured) return REGOLO_TEXT_DEFAULT;

  if (isExcludedTextModel(configured)) {
    if (!warned.has(configured)) {
      warned.add(configured);
      log.warn(
        `REGOLO_DEFAULT_MODEL="${configured}" ist als Text-/Chatmodell gesperrt — ` +
          `es wird "${REGOLO_TEXT_DEFAULT}" bedient. Die Variable kann entfernt werden.`
      );
    }
    return REGOLO_TEXT_DEFAULT;
  }

  return configured;
}
