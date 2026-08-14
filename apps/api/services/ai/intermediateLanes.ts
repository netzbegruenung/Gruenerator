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
  /**
   * Wer einspringt, wenn der Primär zu lange braucht — NICHT wenn er ausfällt,
   * dafür gibt es die Fallback-Kette. Der Aufrufer bestimmt, ab wann „zu lange"
   * gilt, und schaltet den Sibling dann PARALLEL dazu (siehe `runStep` in
   * routes/chat/services/agentPipeline.ts).
   *
   * Warum das hier steht und nicht beim Aufrufer: welches Modell für dieselbe
   * Aufgabe taugt, ist eine Messfrage, und die Messungen stehen in dieser Datei.
   */
  readonly hedge?: { readonly provider: ProviderName; readonly model: string };
}

/** Der Ausgangszustand: was `INTERMEDIATE_MODEL` für alle 36 Stellen war. */
const REGOLO_SMALL_4 = { provider: 'regolo', model: 'mistral-small-4-119b' } as const;

/** Gemma 4 auf Regolo — dieselben Gewichte, die `TEXT_TYPES` und der Synth-Slot
 *  fahren (TEXT_MODEL in providerSelector.ts). Regolos DEFAULT kommt aus der
 *  Umgebung, das Modell muss also benannt werden. */
/** Gemma 4 auf Scaleway/Paris, als MoE mit 4B AKTIVEN Parametern — deshalb rund
 *  doppelt so schnell wie das dichte `gemma4-31b`, das diese Stufe bis zum
 *  01.08.2026 auf Regolo fuhr. Braucht zwingend den Client aus
 *  `scalewayThinkingFetch.ts`, sonst kommt leerer Inhalt zurück. */
const GEMMA_4_SCALEWAY = 'gemma-4-26b-a4b-it';

/** Gemma 4 als dichtes 31B auf Regolo — was `heavy` bis zum 01.08.2026 fuhr.
 *  Lebt nur noch in der `pruefung`-Stufe weiter, Begründung dort. */
const GEMMA_4_REGOLO = 'gemma4-31b';

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
   * Gemma 4 statt Small 4. Belegt ist EIN Grund, und der ist schmal: der
   * Zusammenfassungs-Prompt verlangt Überschriften „für Hauptthemen", Small 4
   * liefert im Mittel EINE (also nur einen Titel), Gemma 4 drei bis vier —
   * bei n = 2 Dokumenten. Wer diese Stufe wieder anfasst, sollte breiter messen.
   *
   * Dazu kommt, was keine Messung ist, aber zählt: Gemma 4 ist das
   * produktionserprobteste Modell im System — es bedient bereits alle
   * `TEXT_TYPES` und den Synth-Slot des Chat-Loops. Die Stufe zieht auf
   * denselben Host, bleibt in derselben Fallback-Kette, und hat als einziger
   * Kandidat einen gemessenen Energie-Koeffizienten (0,722 mWh/Ausgabe-Token),
   * womit `heavy` in der CO₂-Übersicht überhaupt erst auftaucht.
   *
   * Die compute-Suite (100 % gegen 94,1 %) taugt NICHT als Beleg für diese
   * Stufe — ihre Konsumenten sind mit diesem PR nach `compute` gezogen.
   *
   * NICHT als Begründung verwendet, weil unbewiesen: auf dem
   * `json_schema`-/Tool-Call-Pfad meldet Regolo im Antwortfeld `model` einen
   * anderen Namen zurück, als der Request angefragt hat. Das ist eine
   * Selbstauskunft des Gateways und kann ebenso gut eine falsche Beschriftung
   * sein; ohne einen unterscheidenden Test (zeichengleiche Antworten bei
   * Temperatur 0) trägt das keine Modellentscheidung. Erwähnt, damit niemand
   * beim Debuggen über das Feld stolpert und es für gesichert hält.
   *
   * ── 01.08.2026: umgezogen nach Scaleway, gleiche Modellfamilie ──
   *
   * `gemma-4-26b-a4b-it` — Gemma 4 als MoE mit 4B AKTIVEN Parametern. Der oben
   * notierte Preis („rund doppelte Latenz bei Zusammenfassungen, 4,9–6,1 s")
   * war der einzige Einwand gegen diese Stufe, und er verschwindet: gemessen
   * mit den ECHTEN Prompts aller drei Konsumenten, gegen regolo/gemma4-31b.
   *
   *   Konsument                                  26B-A4B      31B (vorher)
   *   Zusammenfassung, Überschriften/Doku (9×)   3,7 · 2,36s  3,7 · 5,28s
   *   classifyDeliverable (max_tokens=20, 12×)   12/12 · 0,34s 12/12 · 0,46s
   *   mem0-Extraktion, JSON gültig (3×)          3/3 · 0,51s  3/3 · 0,93s
   *   Prosa unter 10 parallelen Anfragen         p50 1,78s    p50 2,62s
   *
   * Die 5,28 s reproduzieren die oben notierten 4,9–6,1 s — die Messreihe ist
   * also anschlussfähig, nicht neu kalibriert. Inhaltstreue an 3 Dokumenten mit
   * präzisen Zahlen: keine erfundene Zahl auf beiden Seiten.
   *
   * EIN Befund brauchte eine Prompt-Zeile, keine Modellentscheidung: das 26B
   * fügte in 4 von 6 Läufen eine Wertung hinzu, die die Quelle nicht macht
   * (eine Befragungsnote „2,1" als „eher kritisch" gelesen). Mit der ergänzten
   * Regel in `SINGLE_PASS_PROMPT`/`REDUCE_PROMPT` („Bewerte nichts, was das
   * Dokument nicht selbst bewertet"): 0 von 6. Das 31B hatte die Lücke nur
   * überdeckt — dieselbe Diagnose wie bei Commit 27b8a205a.
   *
   * PREIS, bewusst angenommen: für dieses Modell existiert kein
   * Energie-Koeffizient, und Scaleway meldet keinen Verbrauch zurück. `heavy`
   * fällt damit aus der CO₂-Übersicht (siehe services/usage/energyFootprint.ts).
   * Das Pariser Netz (24 g/kWh gegen Regolos 270) spricht dafür, dass die reale
   * Bilanz besser wird — beziffern lässt sie sich nicht mehr. Schätzen aus der
   * Geschwindigkeit lag im Repo schon einmal um 62 % daneben.
   *
   * MUSS mitkommen, wenn diese Stufe erneut umzieht: `provider: 'scaleway'`
   * bekommt einen Client, der `reasoning_effort: 'none'` erzwingt
   * (scalewayThinkingFetch.ts). Ohne den antwortet dieses Modell mit LEEREM
   * `content` — auch bei max_tokens 1500, nach 5386 Zeichen Reasoning. Leerer
   * Inhalt ist für `aiService` kein Fehler, sondern startet die Fallback-Kette;
   * `classifyDeliverable` mit seinen 20 Token stirbt zuerst.
   *
   * mem0 folgt dieser Stufe NICHT mehr: `services/mem0/config.ts` band
   * `REGOLO_BASE_URL` + `REGOLO_API_KEY` fest an den Modellnamen von hier und
   * hätte bei diesem Umzug einen Scaleway-Namen an Regolo geschickt. Es pinnt
   * jetzt explizit — siehe dort.
   */
  heavy: { provider: 'scaleway', model: GEMMA_4_SCALEWAY },

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

  /**
   * Prüfen, was ein anderes Modell geschrieben hat — mit eigenem Kontext.
   *
   * Konsumenten: die Nachschritte der Pipeline-Agenten
   * (`routes/chat/services/agentPipeline.ts`). Eigene Stufe und nicht `heavy`,
   * weil sich diese hier in zwei Punkten anders verhält als jeder andere
   * Zwischenschritt:
   *
   * 1. **Die Ausgabe ist lang, nicht kurz.** Ein Prüfbericht bringt
   *    Abdeckungstabelle, Befundtabelle und Korrekturvorschläge — Tausende
   *    Tokens, nicht 20. Die Reasoning-Falle aus dem Kopf dieser Datei
   *    (Denk-Tokens zählen gegen `max_tokens`, leerer `content` startet
   *    stillschweigend die Fallback-Kette) trifft deshalb umgekehrt: nicht das
   *    Budget ist zu klein, sondern der Bericht wäre unter einem knappen Deckel
   *    abgeschnitten. Die Aufrufer setzen `max_tokens` entsprechend hoch.
   * 2. **Ein Fehler ist hier eine übersehene Auslassung**, kein schwächerer
   *    Satz. Genau dafür wurde die Kette gebaut: der Lauf vom 13.08.2026 zeigte
   *    ein Modell, das seinen eigenen Text im eigenen Kontext bewertete und
   *    „keine schwierigen Stellen" meldete, während ein Ortsname fehlte.
   *
   * Modell: das dichte `gemma4-31b` auf Regolo, ausdrücklich gewünscht. Es ist
   * NICHT dasselbe wie `heavy`: diese Stufe zog am 01.08.2026 auf Scaleways
   * MoE-Variante um, weil die mit 4B aktiven Parametern rund doppelt so schnell
   * antwortet (Zusammenfassung 2,36 s gegen 5,28 s; p50 unter 10 parallelen
   * Anfragen 1,78 s gegen 2,62 s) bei gleicher Inhaltstreue. Der Preis wird
   * hier bewusst gezahlt — die Kette läuft ohnehin hinter einer gestreamten
   * Antwort, ihre Latenz steht dem Lesen also nicht im Weg.
   *
   * ── 14.08.2026: der Sibling, und warum er kein Ersatz ist ──
   *
   * Regolos `gemma4-31b` antwortete an diesem Tag mit **3,7 tok/s**; die Notiz
   * bei GEMMA_4 in routes/chat/agents/providers.ts hält für dieselbe Lane
   * ~76 tok/s fest. Regolo selbst war gesund (sein `mistral-small-4-119b` lief
   * mit 113 tok/s), es war dieses eine Modell dort. Ein Prüfbericht, der ruhig
   * 36 s braucht, brauchte 218 s und riss die Zeitsperre.
   *
   * Eine Störung ist keine Eigenschaft, also bleibt der Primär stehen. Statt
   * dessen ein Sibling, den der Aufrufer nach einer Frist PARALLEL dazuschaltet.
   * Gemessen am echten Prüf-Prompt, zwei Läufe: 16,8 s / 15,3 s, vollständige
   * Abdeckungs- und Modalitätstabelle, der fehlende Urheber als MITTEL-Befund.
   * Der Client aus `scalewayThinkingFetch.ts` kommt über `case 'scaleway'` in
   * services/ai/providers.ts von selbst mit.
   *
   * GreenPTs `gemma4` wäre der andere Kandidat und ist es NICHT: welche Gewichte
   * es trägt, ist unbelegt (siehe GEMMA_4_GREENPT in
   * routes/chat/agents/providers.ts), und ein stilles Qualitätsgefälle ist
   * ausgerechnet beim Prüfschritt der teuerste Fehler.
   */
  pruefung: {
    provider: 'regolo',
    model: GEMMA_4_REGOLO,
    hedge: { provider: 'scaleway', model: GEMMA_4_SCALEWAY },
  },
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
