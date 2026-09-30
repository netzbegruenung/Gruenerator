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
 * **Bild und Rerank bleiben.** `FLUX.2 [klein]` via Melious
 * und `Qwen3-Reranker-4B` (`services/search/GreenPTRerankService.ts`) sind
 * bewusst weiter im Einsatz: das eine ist eine ausgewiesene Modellwahl im UI,
 * das andere sortiert Suchtreffer und formuliert nichts. Beide laufen über
 * eigene Services und NICHT über `getModel`, werden von dieser Datei also gar
 * nicht berührt — der Test daneben hält das fest, damit eine spätere
 * Verschärfung sie nicht versehentlich mitnimmt.
 *
 * ── Warum eine Sperre und nicht nur ein anderer Default ──
 *
 * Ein Provider-Default stand einmal auf `qwen3.5-122b` und war damit an Stellen
 * wirksam, die niemand gewählt hat: `getFallbackModelForProvider`
 * (providerFallback.ts) gibt schlicht `getDefaultModel(provider)` zurück, und
 * `execute.ts` nimmt `options.model || getDefaultModel(provider)`. Ein anderer
 * Default allein würde das beheben und beim nächsten Setzen eines Env-Werts
 * still zurückfallen — deshalb bleibt die Sperre und der Test daneben prüft
 * jeden Provider-Default und jede Lane gegen sie.
 */

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
