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
 * ── Was die Redundanz angeht: sie liegt NICHT bei Cortecs ──
 *
 * Cortecs führt das Modell bei genau EINEM Endpunkt (infercom).
 * `berget` stand hier bis zum 25.08.2026 als zweiter — das ist live widerlegt:
 * `GET /v1/models` nennt für `gemma-4-31b-it` nur noch `providers:
 * ['infercom']`, und berget taucht in KEINEM der 16 Katalog-Modelle mehr auf.
 * Erzwingen lässt es sich auch nicht: `allowed_providers: ['berget']` antwortet
 * `{berget: Endpoint uses quantization}`, und `allow_quantization: true` hebt
 * das nicht auf — auch nicht mit `eu_native`/`allow_zero_data_retention` auf
 * false. Einen API-Weg zu den „inference settings", auf die die Fehlermeldung
 * verweist, gibt es nicht (alle geprüften Pfade 404).
 *
 * Cortecs ist damit selbst ein Ein-Endpunkt-Host, und vorausbezahlt dazu. Die
 * Reserve dieser Lane ist deshalb ausschliesslich `GEMMA_31B_ALTERNATE` —
 * dieselben Gewichte bei Regolo, eine Ebene über dem Router. Dass es die
 * braucht, zeigte der 14.08.2026: Regolos `gemma4-31b` antwortete mit 3,7
 * tok/s statt der sonst gemessenen ~76, Regolo selbst war gesund, es war
 * dieses eine Modell dort — ein Prüfbericht, der ruhig 36 s braucht, brauchte
 * 218 s. Genau derselbe Ausfall ist auf infercom möglich, und dann trägt
 * Regolo.
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
}

/** Regolos Kennung für das dichte 31B. Auch `REGOLO_TEXT_DEFAULT` in
 *  `textModelPolicy.ts` — das ist Regolos EIGENER Standard und bleibt bei
 *  Regolo, egal wo der Primär gerade liegt. */
export const GEMMA_31B_ON_REGOLO: GemmaHost = { provider: 'regolo', model: 'gemma4-31b' };

/** Dieselben Gewichte über Cortecs, vermittelt an infercom (Luxemburg,
 *  Verarbeitung Deutschland) — seit dem 25.08.2026 der einzige Endpunkt, den
 *  der Katalog für dieses Modell führt. Kleineres Kontextfenster als Regolo
 *  (128k gegen 262k, siehe CTX_CORTECS in routes/chat/agents/providers.ts). */
export const GEMMA_31B_ON_CORTECS: GemmaHost = { provider: 'cortecs', model: 'gemma-4-31b-it' };

/**
 * DER WECHSELPUNKT. Wer Gemma 4 primär bedient.
 *
 * Ein Anbieterwechsel ist diese eine Zeile plus die daneben. Was danach zu
 * prüfen ist, damit der Wechsel nicht still halb wirkt:
 *   1. `modelDiscovery.ts` — trägt der neue Modellname Vision-/Reasoning-Flags?
 *      Ohne Eintrag ist `isVisionCapable` falsch und die Bild-Weiche greift.
 *   2. `energyFootprint.ts` — hat der neue Modellname einen Koeffizienten?
 *      Ohne ihn fällt die grösste Lane aus der CO₂-Übersicht.
 *   3. `modelSiblings.ts` — das Paar dort wird aus diesen Konstanten gebaut,
 *      es muss nichts nachgezogen werden.
 */
export const GEMMA_31B_PRIMARY: GemmaHost = GEMMA_31B_ON_CORTECS;

/** Der andere Host — Ausweich, Hedge und Geschwister-Ziel der
 *  Gesundheitsumschaltung. Immer die Gegenseite von `GEMMA_31B_PRIMARY`. */
export const GEMMA_31B_ALTERNATE: GemmaHost =
  GEMMA_31B_PRIMARY === GEMMA_31B_ON_CORTECS ? GEMMA_31B_ON_REGOLO : GEMMA_31B_ON_CORTECS;
