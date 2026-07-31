/**
 * Wer macht die kleine Arbeit — die, die keine Antwort schreibt.
 *
 * `INTERMEDIATE_MODEL` war EIN Paar (regolo + mistral-small-4-119b), aus dem 36
 * Stellen ihr Modell zogen: Thread-Titel neben `computeNode`, Auto-Tags neben
 * dem Klassifikator. Gemessen an echten Nutzungsdaten ist das die grösste Lane
 * im System (289 von 502 Anfragen, 65 % aller Tokens in 90 Tagen), und sie
 * bekam durchgehend dasselbe Modell — auch für eine dreiwörtige Überschrift.
 *
 * Diese Registry ersetzt das eine Paar durch drei benannte Stufen. Jeder
 * Konsument deklariert, wie schwer seine Aufgabe ist; die Stufe entscheidet
 * Provider und Modell.
 *
 * ── STAND HEUTE: alle drei Stufen zeigen auf dasselbe Modell ──
 *
 * Das ist kein Versehen und keine halbe Arbeit, sondern das Messergebnis. Die
 * Umstellung trennt die AUFGABEN; welches Modell eine Stufe bekommt, ist danach
 * eine Ein-Zeilen-Änderung mit einer Eval dahinter. Was gemessen und verworfen
 * wurde, steht unten — damit niemand dieselben zwei Kandidaten noch einmal
 * durchprobiert.
 *
 * ── Warum überhaupt: Energie ──
 *
 * Energie und CO₂ pro Anfrage hängen an Modellgrösse UND Standort;
 * Koeffizienten in `services/usage/energyFootprint.ts`. Der Standortunterschied
 * allein ist gross: Regolo (Italien) 270 g/kWh × PUE 1,20 gegen Scaleway/GreenPT
 * (Paris) 24 g/kWh × PUE 1,25 — Faktor 10,8. Das macht GreenPT zum
 * naheliegenden Ziel für die Stufen, die keine Antwort schreiben.
 *
 * Nebenbefund, der bleibt: `mistral-small-4-119b` FEHLT in der
 * Koeffiziententabelle, weil GreenPT kein Äquivalent serviert. Die grösste Lane
 * im System ist damit die einzige, deren Fussabdruck wir nicht beziffern können
 * — sie zählt in der Nutzungs-Übersicht als „nicht abgedeckt".
 *
 * ── Gemessen am 31.07.2026, und was dabei herauskam ──
 *
 * Prüfmittel: die ECHTEN Auflöser-Prompts (`docsIntentTiebreak`,
 * `sourceScopeResolver`, `generationResolver`), 30 gelabelte Fälle aus ihren
 * eigenen dokumentierten Fallen, 3 Wiederholungen.
 *
 *   Modell                                  Treffer    schwankend   p50/p90 Latenz
 *   regolo/mistral-small-4-119b (heute)     95,6 %     1 von 30     185 / 359 ms
 *   greenpt/mistral-small-3.2-24b           96,7 %     0 von 30     761 / 1760 ms
 *   greenpt/gpt-oss-120b                     0,0 %     —            (unbrauchbar)
 *
 * 1. **gpt-oss-120b ist strukturell ungeeignet**, nicht bloss schlechter. Es ist
 *    ein Reasoning-Modell: die Denk-Tokens zählen gegen `max_tokens`, und die
 *    Auflöser rufen mit `max_tokens: 16` auf. Ergebnis in ALLEN 90 Läufen:
 *    `content: null`, `finish_reason: "length"`, die Antwort steckt unerreichbar
 *    im `reasoning`-Feld. Erst ab `max_tokens: 128` erscheint ein Wort — und
 *    kostet dann **109 Ausgabe-Tokens für eine einwortige Antwort**, wo das
 *    24b-Modell 2 braucht. Bei 0,811 mWh/Token frisst das den Standortvorteil
 *    vollständig auf (~65× mehr Energie pro Aufruf als das 24b).
 *    `reasoning_effort: "low"` wird angenommen und ignoriert, `"none"`
 *    abgelehnt. Schlimmer noch: leerer `content` ist für `aiService` KEIN
 *    Fehler, sondern löst die volle Fallback-Kette aus — jeder Auflöser-Aufruf
 *    zahlte also GreenPT-Roundtrip PLUS Kette und risse jedes Zeitbudget.
 *    Dieselbe Falle steht schon zweimal im Repo: `services/mem0/config.ts`
 *    (gpt-oss:120b „emitted chain-of-thought preamble and routinely failed the
 *    JSON parse") und CLAUDE.md zu Scaleway-Reasoning.
 *
 * 2. **mistral-small-3.2-24b ist qualitativ gut genug** (leicht besser und
 *    stabiler als heute), scheitert aber am Zeitbudget: unter 10 gleichzeitigen
 *    Anfragen lagen 5 von 30 Antworten über 1500 ms, bei Regolo 0 von 30. Die
 *    Auflöser haben harte Budgets von 900–1500 ms; ein Überschreiten liefert
 *    `null`, der Turn fällt auf Tier 4 durch und zahlt den 27k-Zeichen-Prompt —
 *    genau das, was die Dispositions-Serie (#2272–#2279) von 18,1 % auf 3,0 %
 *    gedrückt hat. Für die Hintergrund-Stufe (`trivial`) wäre es tragbar; das
 *    ist der nächste sinnvolle Schritt, aber eine eigene Änderung mit eigener
 *    Messung.
 *
 * ── Ausfallsicherheit, und warum sie nicht überall gleich ist ──
 *
 * Zwei Konsumententypen, die man beim nächsten Verschieben nicht verwechseln
 * darf:
 *   - über `aiWorkerPool.processRequest` → die Fallback-Kette
 *     (`litellm` → `regolo` → `mistral`, providerFallback.ts) fängt Ausfall UND
 *     leere Antwort ab. GreenPT steht NICHT in der Kette, wäre also selbst
 *     abgesichert, ohne je als Auffangnetz zu dienen.
 *   - über `getIntermediateModel()` + direktes `generateText`/`generateObject`
 *     → KEINE Fallback-Kette. Hier zählt nur der `try`/`catch` des Aufrufers.
 *
 * F1 (CLAUDE.md): Stufennamen und Modell-IDs sind interne IDs und werden nicht
 * umbenannt.
 */

import type { ProviderName } from './providers.js';

export interface IntermediateLaneConfig {
  readonly provider: ProviderName;
  readonly model: string;
}

/** Das heute einzige Ziel aller drei Stufen — siehe Messung im Kopf. */
const REGOLO_SMALL_4 = { provider: 'regolo', model: 'mistral-small-4-119b' } as const;

export const INTERMEDIATE_LANES = {
  /**
   * Kurze, schematische Ausgabe OHNE Latenzbudget: Hintergrundarbeit, die der
   * Aufrufer nicht abwartet und die bei Ausfall einen Ersatzwert hat
   * (Thread-Titel steht als Heuristik schon in der DB, bevor das Modell gefragt
   * wird). Die Stufe mit der grössten Stückzahl und den kleinsten Antworten —
   * also die, bei der ein Wechsel am meisten brächte und am wenigsten riskiert.
   */
  trivial: REGOLO_SMALL_4,

  /**
   * Der Hot Path: kurze Ausgabe, aber harte Zeitbudgets (900–1500 ms) und
   * Routing-Wirkung. Klassifikator, die fünf Auflöser, Query-Expansion.
   * Verschiebt nur, wer die Latenz unter Last gemessen hat.
   */
  standard: REGOLO_SMALL_4,

  /**
   * Die Qualitätslatte: Zusammenfassungen, Rechen-Pläne, der Boards-Agent, die
   * mem0-Extraktion. Unterscheidet sich von `standard` darin, WELCHER BELEG sie
   * bewegen dürfte — `standard` eine Latenz- und Treffermessung, `heavy` eine
   * Qualitäts-Eval. Das ist der Unterschied, den ein gemeinsamer Name
   * verstecken würde.
   *
   * ACHTUNG mem0: `services/mem0/config.ts` baut seinen Extraktions-Client aus
   * `REGOLO_BASE_URL` + `REGOLO_API_KEY` PLUS dem Modellnamen dieser Stufe.
   * Wandert `heavy` zu einem anderen Anbieter, muss dort die Basis-URL mit —
   * sonst schickt es einen fremden Modellnamen an Regolo.
   */
  heavy: REGOLO_SMALL_4,
} as const satisfies Record<string, IntermediateLaneConfig>;

export type IntermediateLaneId = keyof typeof INTERMEDIATE_LANES;

/**
 * Provider und Modell einer Stufe.
 *
 * Aufrufer halten das Ergebnis als Modul-Konstante (`const LANE =
 * intermediateLane('trivial')`) und lesen `LANE.provider` / `LANE.model` — so
 * steht die Einordnung einmal oben in der Datei und nicht verstreut an jeder
 * Aufrufstelle.
 */
export function intermediateLane(lane: IntermediateLaneId): IntermediateLaneConfig {
  return INTERMEDIATE_LANES[lane];
}
