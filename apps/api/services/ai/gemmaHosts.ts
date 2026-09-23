/**
 * Wer das dichte Gemma 4 31B bedient — die EINE Stelle, die das entscheidet.
 *
 * Gemma 4 schreibt das beste Deutsch im System und trägt deshalb fast alles,
 * was ein Nutzer als Text zu sehen bekommt: die 15 Textlanes in `lanes.ts`
 * (Antrag, Rede, Social, Leichte Sprache …), die Antwortlane des Chats, den
 * Synth-Slot des agentischen Loops und die Stufen `heavy` und `pruefung` der
 * Zwischenarbeit. Bis zum 25.08.2026 stand der Host an JEDER dieser Stellen
 * einzeln im Code — sechs Dateien, zwei Schreibweisen des Modellnamens, und
 * ein Anbieterwechsel war deshalb kein Handgriff, sondern eine Suche.
 *
 * Genau das ist hier aufgelöst. Ein Wechsel ist ab jetzt EINE Zeile: die
 * Zuweisung von `GEMMA_31B_PRIMARY` weiter unten.
 *
 * ── Warum ein Paar aus Provider UND Modell ──
 *
 * Dieselben Gewichte heissen bei den beiden Hosts verschieden — `gemma4-31b`
 * bei Regolo, `gemma-4-31b-it` bei Cortecs. Ein Wechsel, der nur den Provider
 * umhängt und den Modellnamen mitnimmt, erntet einen 404; genau das passierte
 * am 21.08.2026 beim Umzug einer Lane auf GreenPT. Deshalb ist der
 * Wechselpunkt ein Paar und kein Provider-String.
 *
 * ── Warum Cortecs seit dem 25.08.2026 der Primär ist ──
 *
 * Gemessen am 21.08.2026 (`scripts/probeGemma31Hosts.ts`), gestreamt,
 * verschränkt, mit Aufwärmlauf, je fünf ruhige und vier gleichzeitige Läufe:
 *
 *                        TTFT     Durchsatz    gesamt
 *   regolo/gemma4-31b     129 ms   81,3 tok/s   5,06 s
 *   cortecs (infercom)   1122 ms  210,7 tok/s   2,81 s
 *
 * Der Gleichstand liegt bei rund 130 Ausgabe-Tokens. Alles, was Gemma hier
 * schreibt, ist länger als das — eine Chat-Antwort, ein Antrag, eine Rede —,
 * also gewinnt der Durchsatz. Inhaltstreue war in 22 Läufen nicht
 * unterscheidbar. Die Sekunde Anlauf ist der Preis und wird bezahlt.
 *
 * ── Die Redundanz bei Cortecs: doch da, und einmal falsch abgeschrieben ──
 *
 * Cortecs führt das Modell bei ZWEI Endpunkten: `infercom` und `berget`.
 *
 * Hier stand vom 25.08. bis zum 29.08.2026 das Gegenteil — berget sei aus dem
 * Katalog verschwunden und über `allowed_providers` nicht erzwingbar
 * (`Endpoint uses quantization`). Beide Hälften sind am 29.08.2026 live
 * widerlegt:
 *
 *   GET /v1/models → gemma-4-31b-it: providers ['infercom', 'berget']
 *   (der Katalog führt 67 Modelle, nicht die hier notierten 16)
 *
 *   Aufruf                                   HTTP  x-cortecs-provider  Zeit
 *   ohne Vorgabe                              200  infercom            1218 ms
 *   allowed_providers: ['berget']             200  berget              1482 ms
 *   allowed_providers: ['berget'] + allow_q.  200  berget              1545 ms
 *   allowed_providers: ['infercom']           200  infercom            1140 ms
 *
 * Bemerkenswert daran: berget antwortet auch OHNE `allow_quantization`. Der
 * Quantisierungs-Filter, an dem der Versuch am 25.08. scheiterte, greift heute
 * nicht mehr.
 *
 * Was daraus NICHT folgt: dass sich am Verhalten dieser Datei etwas ändern
 * müsste. Die Wahl bleibt die des Routers. Was sich ändert, ist die
 * Begründung: die Reserve dieser Lane liegt nicht mehr AUSSCHLIESSLICH bei
 * `GEMMA_31B_ALTERNATE`, sondern zusätzlich beim Router selbst.
 *
 * Zwei Halbsätze standen an dieser Stelle bis zum 01.09.2026 falsch, und beide
 * sind an dem Tag nachgemessen:
 *
 *  - „Ohne Vorgabe wählt der Router weiterhin infercom." Von 46 Läufen ohne
 *    Pinning gingen 46 an **berget**. Eine Stunde später gingen drei von drei
 *    an infercom. Die Wahl ist also nicht fest, sondern wandert — was der
 *    Absatz oben ohnehin sagt, nur zog der Satz die gegenteilige Folgerung.
 *  - „und wir geben keine vor." Doch: `cortecsFetchWithPolicy` hängt an JEDE
 *    Anfrage `allowed_providers` (die elf souveränen Namen), `eu_native` und
 *    `allow_zero_data_retention`. Die Liste ist weit genug, dass beide
 *    Gemma-Upstreams darin stehen — am Verhalten ändert das nichts, an der
 *    Begründung alles.
 *
 * Was der Router NICHT tut: innerhalb einer Anfrage umschalten. Er wählt
 * einmal, und wenn dieser Upstream schweigt, schweigt die Anfrage — ein an
 * einen zähen Upstream gepinnter Zug lief am 01.09.2026 gemessen 301 s ohne
 * Fehler und ohne Wechsel. Die zwei Endpunkte sind Kapazität und ein zweiter
 * Vertrag, kein Failover pro Anfrage; das bleibt die Aufgabe von
 * `GEMMA_31B_ALTERNATE` und der Sibling-Kette in responseStreamingService.ts.
 *
 * Die Lehre, die hier bleiben soll: ein Katalogeintrag und ein
 * Erzwingungsversuch sind Momentaufnahmen eines fremden Systems. Aus einem
 * „geht heute nicht" wurde in dieser Datei ein „ist ein Ein-Endpunkt-Host",
 * und das wanderte als Tatsache in drei weitere Dateien. Wer den Befund
 * wiederholt, misst neu — der Aufruf steht oben.
 *
 * `GEMMA_31B_ALTERNATE` bleibt trotzdem die tragende Reserve, und zwar aus
 * einem Grund, den kein Endpunkt-Zählen berührt: es ist ein anderer
 * VERTRAGSPARTNER. Dass es die braucht, zeigte der 14.08.2026: Regolos
 * `gemma4-31b` antwortete mit 3,7 tok/s statt der sonst gemessenen ~76, Regolo
 * selbst war gesund, es war dieses eine Modell dort — ein Prüfbericht, der
 * ruhig 36 s braucht, brauchte 218 s. Genau derselbe Ausfall ist auf infercom
 * möglich; dass berget daneben steht, hilft nur, wenn Cortecs als Ganzes
 * gesund ist.
 *
 * ── Was der Wechsel MITNIMMT, und was nicht ──
 *
 *  - **Denken bleibt, über einen anderen Hebel.** Der Host nimmt kein
 *    `reasoning_effort` an, das etwas bewirkt — die gradierten Werte gehen
 *    durch und ändern nichts, `none` wird mit 400 abgelehnt. Was wirkt, ist
 *    `chat_template_kwargs.enable_thinking`, und zwar in beide Richtungen.
 *    Verdrahtet ist das in `regoloReasoningStream.ts`, wo auch die Messreihe
 *    steht; die 14 Intents der Auto-Policy, die auf dieser Lane denken,
 *    behalten ihr Verhalten. Ohne diesen Einbau wäre ihr `reasoning: 'low'`
 *    ein stiller No-Op geworden — der Wächter in `autoPolicy.vitest.ts` hat
 *    genau das abgefangen.
 *  - **Bilder bleiben auf Regolo, und das ist jetzt gemessen.** Der Katalog
 *    behauptet Bildfähigkeit (`input_modalities: ['text','image']`, Tag
 *    `Image`); ein echter Bild-Turn gegen infercom antwortet am 25.08.2026
 *    mit **HTTP 500** (`unexpected_error`). `gemma-4-31b-it` steht in
 *    `modelDiscovery.ts` deshalb mit `vision: false`, die Bild-Weiche in
 *    `responseStreamingService.ts` tauscht innerhalb der Lane auf den
 *    Regolo-Sibling. Der Katalog ist hier keine Quelle — er beschreibt die
 *    Gewichte, nicht den Endpunkt.
 *  - **Der CO₂-Ausweis bleibt.** `gemma-4-31b-it` erbt in
 *    `energyFootprint.ts` die gemessenen Koeffizienten des 31B — dieselben
 *    Gewichte, dieselbe Architektur. Das ist derselbe Schluss wie bei
 *    `verdigado-think` und ausdrücklich NICHT der, der beim MoE `26b-a4b`
 *    verweigert wurde: das ist eine andere Architektur.
 *
 * ── PREIS, bewusst angenommen ──
 *
 * Cortecs ist VORAUSBEZAHLT. Ein leeres Guthaben antwortet mit HTTP 401 wie
 * ein fehlender Schlüssel. Das trifft jetzt den PRIMÄR und nicht mehr nur den
 * Ausweich, also alle Gemma-Lanes auf einmal. Aufgefangen wird es zweifach:
 * `instantiateModel` prüft `CORTECS_API_KEY` und weicht auf Regolo aus, und
 * die Ausweichkette hat Regolo als Ziel. Der eigentliche Schalter dagegen ist
 * Auto-Top-up im Cortecs-Konto, nicht Code.
 *
 * F0/F1 (CLAUDE.md): die Modell-IDs sind Anbieter-Kennungen und Registry-IDs.
 * Sie werden hier benannt, nicht umbenannt.
 */

import { type ProviderName } from './providers.js';

export interface GemmaHost {
  readonly provider: ProviderName;
  readonly model: string;
  /**
   * Was der ENDPUNKT annimmt, nicht was die Gewichte tragen. Die beiden Hosts
   * sind hier nicht gleich gross, und eine zu grosse Zahl ist keine
   * Fehlermeldung, sondern eine stille Kürzung.
   */
  readonly contextWindow: number;
  /**
   * Die Kennung in `AVAILABLE_MODELS` (routes/chat/agents/providers.ts), die
   * GENAU diesen Host meint — nicht die Lane, die gerade primär ist.
   *
   * Sie steht hier, damit die Antwortlane ihren Ausweich-Zeiger ableiten kann,
   * statt ihn ein zweites Mal zu behaupten. F0/F1: `gemma-4-26b` heisst so aus
   * historischen Gründen und meint das dichte 31B über Cortecs; umbenannt wird
   * nichts, der Name steckt in persistierten Thread-Zuständen.
   */
  readonly laneId: string;
}

/** Regolos Kennung für das dichte 31B. Auch `REGOLO_TEXT_DEFAULT` in
 *  `textModelPolicy.ts` — das ist Regolos EIGENER Standard und bleibt bei
 *  Regolo, egal wo der Primär gerade liegt. */
export const GEMMA_31B_ON_REGOLO: GemmaHost = {
  provider: 'regolo',
  model: 'gemma4-31b',
  contextWindow: 262_144,
  laneId: 'gemma-regolo',
};

/** Melious' European routing endpoint serving the same Gemma 4 31B weights.
 *
 *  ── 44k, nicht die 256k der Hub-Seite ──
 *
 *  Nadelprobe am 23.09.2026 (Markierung am Anfang, 20 Ausgabe-Tokens,
 *  `reasoning_effort: 'none'`): `:balanced` vermittelt an Melious' eigenen
 *  Knoten (`environment_impact.provider_id: 'melious'`, `location: 'FI'`), und
 *  der nimmt Prompt + Ausgabe bis rund 45.056 Tokens:
 *
 *    in=44.859  → 200, Nadel gefunden
 *    in≈45.050  → 400 `invalid_request_error` („malformed"), nach 0,5 s
 *    in≳131k    → 400 `context_length_exceeded` (Melious' eigene Vorprüfung)
 *
 *  Kein Byte-Limit (90 KB Ziffern scheitern, 214 KB Prosa gehen durch) und
 *  keine Zeitsperre (der 400 kommt sofort). Die Grenze ist also LAUT, nicht
 *  still — aber ein gegen 262k bemessener Prompt scheitert hier sicher.
 *
 *  Zweite Grenze, die kein Fenster ist: Melious' Gateway trennt nach 60 s.
 *  Der FI-Knoten brauchte für 42–44k Tokens Prompt 48–56 s bis zur Antwort und
 *  riss unter paralleler Last schon bei 26k die 60 s. Cortecs beantwortete
 *  dieselben Prompts in 3–6 s (infercom) bzw. 6–11 s (berget), 120k in 15 s.
 *  Bei kurzen Prompts ist Melious dagegen schneller: ~95 tok/s gegen ~40 tok/s
 *  bei 0–15k Kontext, gleiche Messung. Das ist der Grund, warum Melious der
 *  Ausweich bleibt und nicht der Primär wird.
 *
 *  `:speed` erreichte einmal infercom/DE und nahm dort 60k — aber welcher
 *  Upstream antwortet, entscheidet Melious pro Anfrage, und keine Variante
 *  sagt ein Fenster zu. Deshalb gilt der bestätigte Wert des Standardwegs, mit
 *  Reserve unter der Kante wie bei Cortecs.
 *
 *  Bilder: HTTP 400 auf einen echten Bild-Turn (23.09.2026), obwohl die
 *  Hub-Seite Bildeingabe führt — wie bei Cortecs beschreibt der Katalog die
 *  Gewichte, nicht den Endpunkt.
 *
 *  Denken: dieser Host denkt OHNE Vorgabe (~300 Reasoning-Tokens auf eine
 *  Zwei-Satz-Frage, 3–4 s statt 1 s). Abgeschaltet wird es auf dem SDK-Pfad
 *  (`meliousThinkingFetch.ts`), angeschaltet im Denk-Strom
 *  (`regoloReasoningStream.ts`). */
export const GEMMA_31B_ON_MELIOUS: GemmaHost = {
  provider: 'melious',
  model: 'gemma-4-31b:balanced',
  contextWindow: 44_000,
  laneId: 'gemma-melious',
};

/** Dieselben Gewichte über Cortecs, ohne Vorgabe an infercom vermittelt
 *  (Luxemburg, Verarbeitung Deutschland); `berget` steht daneben, siehe die
 *  Messung im Kopf dieser Datei.
 *
 *  ── 128k, per Nadelprobe bestätigt (23.09.2026, Issue #3067) ──
 *
 *  Der Katalog meldet seit dem 31.08.2026 `context_size: 262000`. Das gilt nur
 *  für EINEN der beiden Unteranbieter, und ohne Vorgabe wählt der Router pro
 *  Anfrage selbst — er nahm an diesem Tag in allen Läufen infercom.
 *
 *  Markierung am Anfang, 20 Ausgabe-Tokens, je Unteranbieter erzwungen
 *  (`allowed_providers`):
 *
 *                  in=59.530   in=120.008   in=140.747   in≈202k
 *    infercom      gefunden    gefunden     400          400
 *    berget        gefunden    gefunden     gefunden     —
 *
 *    infercom: „maximum context length is 131072 tokens"
 *    berget:   „maximum context length is 262144 tokens" (400 bei 281.833)
 *
 *  Die Decke ist also infercoms 131.072, und sie ist LAUT: kein Unteranbieter
 *  kürzte still, `usage.prompt_tokens` kam jedes Mal vollständig zurück. 128k
 *  bleibt, weil der Router infercom wählen darf; 262k wäre nur mit erzwungenem
 *  berget wahr, und das kostet gemessen die doppelte Zeit (120k: 36,7 s gegen
 *  15,0 s). Der Katalog beschreibt auch hier nicht den Endpunkt, sondern den
 *  günstigsten Fall.
 *
 *  Wer neu misst: Markierung an den ANFANG, bis zur Zielgrösse auffüllen, eine
 *  Grösse unter und eine über der Kante, BEIDE Unteranbieter einzeln — und
 *  `usage.prompt_tokens` zurücklesen, denn eine stille Kürzung zeigt sich dort
 *  und nicht im HTTP-Status. `scripts/probeCortecs.ts` ist die Vorlage. */
export const GEMMA_31B_ON_CORTECS: GemmaHost = {
  provider: 'cortecs',
  model: 'gemma-4-31b-it',
  contextWindow: 128_000,
  laneId: 'gemma-4-26b',
};

/**
 * DER WECHSELPUNKT. Diese beiden Zeilen, und sonst nichts.
 *
 * Sie müssen die beiden Seiten desselben Paares sein — der Ausweich ist
 * absichtlich ein anderer VERTRAGSPARTNER und kein Reservemodell, sonst nimmt
 * ein Einbruch beide Seiten. Ein Wechsel heisst: die zwei Zuweisungen tauschen.
 *
 * Bewusst KEIN `PRIMARY === X ? … : …`: der Doku-Generator
 * (`documentation/scripts/generate-models.mjs`) liest diese Datei per AST, um
 * die öffentliche Modell-Tabelle zu erzeugen, und ein Ternär ist für ihn nicht
 * auswertbar. Zwei benannte Zuweisungen sind ohnehin das, was man beim Lesen
 * sehen will.
 *
 * Was nach einem Wechsel zu prüfen ist:
 *   1. `modelDiscovery.ts` — trägt der neue Modellname Vision-/Reasoning-Flags?
 *      Ohne Eintrag ist `isVisionCapable` falsch und die Bild-Weiche greift.
 *   2. `energyFootprint.ts` — hat der neue Modellname einen Koeffizienten?
 *      Ohne ihn fällt die grösste Lane aus der CO₂-Übersicht.
 *   3. `regoloReasoningStream.ts` — kennt der neue Host einen Denk-Hebel, und
 *      welchen? Die drei Hosts benutzen drei verschiedene.
 *   4. `modelSiblings.ts` und die Lane-Konfigurationen ziehen von selbst mit.
 */
export const GEMMA_31B_PRIMARY: GemmaHost = GEMMA_31B_ON_CORTECS;
export const GEMMA_31B_ALTERNATE: GemmaHost = GEMMA_31B_ON_MELIOUS;
