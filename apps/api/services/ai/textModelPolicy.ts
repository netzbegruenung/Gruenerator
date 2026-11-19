/**
 * Welche Text-/Chat-Modelle der Grünerator nicht bedient — und warum das eine
 * eigene Datei ist statt einer Zeile im Provider-Default.
 *
 * ── Was hier geregelt wird ──
 *
 * Chinesische Text- und Chatmodelle (Qwen, GLM/Zhipu, Kimi/Moonshot, MiniMax,
 * DeepSeek) beantworten keine Nutzeranfragen — mit genau einer benannten
 * Ausnahme, der freischaltpflichtigen Lane „Panda" (`PANDA_LANE_MODEL`) samt
 * ihrem Ausweich (`PANDA_FALLBACK_MODEL`).
 * Der Grünerator ist ein Werkzeug einer deutschen Partei; welches Modell einen
 * politischen Text schreibt oder eine Anfrage einordnet, ist keine reine
 * Qualitätsfrage.
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
 * wirksam, die niemand gewählt hat: jede Fallback-Stufe von `runChain`
 * (generate.ts) antwortet auf `getDefaultModel(provider)`, und
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

/**
 * Die eine benannte Ausnahme: DeepSeek v4.1 Flash auf der Lane „Panda".
 *
 * Entschieden am 01.10.2026: Accounts, die nach einer Schulung von einem
 * Instanz-Admin freigeschaltet wurden (auf `bgst` standardmäßig), dürfen eine
 * chinesische Modellfamilie bewusst wählen. Das ist eine ausgewiesene Wahl im
 * Modellwähler, nie ein Default, nie ein Ausweichziel einer anderen Lane.
 *
 * Deshalb steht die Ausnahme HIER als Name und nicht in der Regex oben:
 * `isExcludedTextModel` sperrt DeepSeek weiter überall (Playground-Liste,
 * Provider-Defaults, `AI_LANES`), und der Wächter in
 * routes/chat/agents/providers.vitest.ts lässt das Modell genau an der Lane
 * `gruenerator-panda` und ihrem GreenPT-Geschwister zu.
 */
export const PANDA_LANE_MODEL = 'deepseek-v4.1-flash';

/**
 * Die zweite benannte Ausnahme, und sie hängt an der ersten: GLM-5.3 auf
 * Melious ist der Ausweich der Lane „Panda" — nur dort, nie wählbar, nie
 * Ausweich einer anderen Lane.
 *
 * Entschieden am 19.11.2026: Wer Panda freigeschaltet bekommen hat, hat die
 * chinesische Modellfamilie bewusst gewählt; fällt DeepSeek aus, bleibt der
 * Zug in derselben Wahl. Für alle anderen gilt die Sperre unverändert.
 *
 * Warum GLM und nicht `deepseek-v4.1-flash-1017`: gemessen am 19.11.2026 streamt
 * GLM-5.3 auf Melious Werkzeugargumente (rund 500 Chunks, längste Pause 1,1 s),
 * die 1017-Fassung puffert sie wie Panda selbst (14–18 s Stille).
 *
 * Der Wächter in routes/chat/agents/providers.vitest.ts lässt das Modell genau
 * in der Loop-Kette von Panda zu.
 */
export const PANDA_FALLBACK_MODEL = 'glm-5.3';
