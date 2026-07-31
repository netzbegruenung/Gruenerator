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
 * ── Vier Stufen, drei Modelle ──
 *
 *   trivial   regolo/mistral-small-4-119b   unverändert (Messung unten)
 *   standard  regolo/mistral-small-4-119b   unverändert (Messung unten)
 *   heavy     regolo/gemma4-31b             besser + benanntes Modell antwortet
 *   compute   mistral-medium-2604 → Paris   einzige Stufe, wo ein Fehler eine
 *                                           falsche ZAHL ist
 *
 * `trivial` und `standard` zeigen weiterhin auf dasselbe Modell wie vorher —
 * das ist Messergebnis, nicht halbe Arbeit. Was dort geprüft und verworfen
 * wurde, steht unten, damit niemand dieselben Kandidaten noch einmal
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

/** Der Ausgangszustand: was `INTERMEDIATE_MODEL` für alle 36 Stellen war. */
const REGOLO_SMALL_4 = { provider: 'regolo', model: 'mistral-small-4-119b' } as const;

/** Gemma 4 auf Regolo — dieselben Gewichte, die `TEXT_TYPES` und der Synth-Slot
 *  fahren (TEXT_MODEL in providerSelector.ts). Regolos DEFAULT ist qwen, das
 *  Modell muss also benannt werden. */
const GEMMA_4 = 'gemma4-31b';

/** `mistral-medium-2604` === Mistral Medium 3.5. Provider bleibt `mistral`:
 *  `routeMistralModel` schickt genau diese ID nach Scaleway/Paris, und alles
 *  Policy-Relevante prüft `provider === 'mistral'` (siehe CLAUDE.md). */
const MISTRAL_MEDIUM = 'mistral-medium-2604';

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
   * Die Qualitätslatte: Zusammenfassungen, der Boards-Agent, die
   * mem0-Extraktion, Deep-Research-Planung.
   *
   * Gemma 4 statt Small 4, aus drei Gründen (Messung 31.07.2026):
   *   - Trefferquote 100 % gegen 94,1 % auf der compute-Suite (51 Läufe);
   *   - Gliederung: der Zusammenfassungs-Prompt verlangt Überschriften „für
   *     Hauptthemen", Small 4 liefert im Mittel EINE (also nur einen Titel),
   *     Gemma 4 drei bis vier;
   *   - und der Grund, der ohne Messung unsichtbar bleibt: **Regolo bedient
   *     strukturierte Anfragen auf `mistral-small-4-119b` still mit
   *     `qwen3.5-9b`.** Reproduzierbar 6/6 über `json_schema` UND erzwungenen
   *     Tool-Call. Das betrifft genau die `generateObject`-Konsumenten dieser
   *     Stufe (mem0-Gatekeeper, `extractService`, Deep-Planner) — sie liefen
   *     also auf einem 9-Mrd.-Qwen, obwohl sie ein 119-Mrd.-Modell benennen,
   *     und qwen steht in `AVOID_AS_SYNTH`. Bei `gemma4-31b` antwortet 6/6 das
   *     angeforderte Modell.
   *
   * KEIN akuter Fehler daraus: `regoloFetchWithThinkingDisabled` hängt
   * `enable_thinking:false` an, und damit liefert auch das untergeschobene Qwen
   * gültiges JSON. Ohne das Flag ist die Antwort leer — die beiden Bausteine
   * hängen also zusammen, ohne dass es irgendwo steht.
   *
   * Preis: rund doppelte Latenz bei Zusammenfassungen (4,9–6,1 s gegen
   * 2,2–3,0 s) bei gleicher Token-Zahl, also echt langsamer pro Token. Tragbar,
   * weil `REQUEST_TIMEOUT` bei 120 s liegt — es gibt hier keine Zeitklippe wie
   * bei den Auflösern, nur Wartezeit.
   *
   * Gemma 4 ist ausserdem das produktionserprobteste Modell im System: es
   * bedient bereits alle `TEXT_TYPES` und den Synth-Slot des Chat-Loops. Diese
   * Stufe zieht auf denselben Host, nicht auf einen neuen.
   *
   * ACHTUNG mem0: `services/mem0/config.ts` baut seinen Extraktions-Client aus
   * `REGOLO_BASE_URL` + `REGOLO_API_KEY` PLUS dem Modellnamen dieser Stufe.
   * Wandert `heavy` zu einem anderen Anbieter, muss dort die Basis-URL mit —
   * sonst schickt es einen fremden Modellnamen an Regolo. Gemma 4 liegt auf
   * Regolo, der Umzug ist also hier noch folgenlos.
   */
  heavy: { provider: 'regolo', model: GEMMA_4 },

  /**
   * Rechnen. Eigene Stufe, weil hier als Einzigem ein Modellfehler als
   * FALSCHE ZAHL beim Nutzer ankommt — überall sonst wird eine schwächere
   * Antwort nur schwächer.
   *
   * Mistral Medium 3.5, das `routeMistralModel` nach Scaleway/Paris schickt.
   * Gemessen (17 Fälle × 3) schlägt es beide Alternativen auf JEDER Achse:
   *
   *            Treffer   p50       out-tok   mgCO₂/Aufruf
   *   Small 4   94,1 %    540 ms     68      nicht bezifferbar
   *   Gemma 4  100,0 %   1264 ms     69      12,97
   *   Medium   100,0 %   1144 ms     70       7,56
   *
   * Dass das GRÖSSTE Modell den kleinsten Fussabdruck hat, ist kein Fehler in
   * der Tabelle: es braucht pro Token 6,3× mehr Energie, läuft aber am
   * Pariser Netz (24 g/kWh statt 270). Bei ~70 Ausgabe-Tokens gewinnt der
   * Standort. Genau deshalb ist Medium hier vertretbar und als Dauer-Lane
   * nicht: `compute` feuert nur bei Rechen-/Zählfragen.
   *
   * `pandasComputeNode` hatte diese Entscheidung bereits einzeln getroffen
   * (eigenes `CODEGEN_MODEL` mit derselben Begründung). Diese Stufe sammelt
   * die Doppelung ein.
   */
  compute: { provider: 'mistral', model: MISTRAL_MEDIUM },
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
