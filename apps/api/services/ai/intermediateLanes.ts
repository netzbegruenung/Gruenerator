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
 * ── Die Stufen, Stand 29.08.2026 ──
 *
 *   trivial   greenpt/mistral-small-3.2-24b  Hintergrund, kein Zeitbudget
 *   standard  greenpt/mistral-small-3.2-24b  heisser Pfad, 900–2500 ms Sperren
 *   heavy     cortecs/gemma-4-31b-it         Qualitätslatte, lange Prosa
 *   pruefung  cortecs/gemma-4-31b-it         prüft, was ein Modell schrieb
 *   compute   mistral-medium-2604 → Paris    einzige Stufe, wo ein Fehler eine
 *                                            falsche ZAHL ist
 *
 * ── Warum Regolo nirgends mehr vorne steht ──
 *
 * `trivial` und `standard` liefen bis zum 29.08.2026 auf
 * `regolo/mistral-small-4-119b`, und die Messreihe von 31.07.2026 weiter unten
 * trug diese Wahl: 95,6 % gegen 96,7 %, aber 185/359 ms gegen 761/1760 ms, und
 * die Stufe `standard` hat Sperren ab 900 ms.
 *
 * Was die Messreihe nicht messen konnte, ist die Ausfallart, die dann eintrat:
 * an diesem Tag antwortete Regolo mit HTTP 402 (`trial_expired`) — ein
 * KONTO-Limit, kein Modellproblem. Ein zu langsames Modell liefert eine
 * schlechtere Antwort; ein abgewiesenes Konto liefert keine. Regolo steht
 * seither auf keiner Stufe mehr vorne und trägt als letztes Kettenglied
 * weiterhin bei, wo es hilft.
 *
 * Der Latenz-Einwand ist damit NICHT erledigt, sondern verschoben, und das
 * gehört hierhin: gemessen am 29.08.2026 gegen die lebenden Endpunkte, ruhig
 * und nacheinander, `max_tokens: 16`, beide mit korrekter Antwort in 2 Tokens —
 * GreenPT 389/427/458/550/557 ms, Cortecs 338/404/463 ms. Beide liegen damit
 * unter der 900-ms-Sperre von `editTargetResolver`. Das widerlegt den Befund
 * von 31.07. NICHT: der betraf 10 GLEICHZEITIGE Anfragen (5 von 30 über
 * 1500 ms), und diese Probe war sequenziell. Wer die Aufrufer-Sperren reissen
 * sieht, misst genau das nach, bevor er an der Kette dreht.
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
 *    abgelehnt. Schlimmer noch: leerer `content` ist für die Fassade KEIN
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
 *   - über `aiText`/`aiObject`/`aiTools` → die Fallback-Kette
 *     (`litellm` → `regolo` → `mistral`, providerFallback.ts) fängt Ausfall UND
 *     leere Antwort ab. GreenPT steht NICHT in der Kette, wäre also selbst
 *     abgesichert, ohne je als Auffangnetz zu dienen.
 *   - über `getIntermediateModel()` + direktes `generateText`/`generateObject`
 *     → seit dem 29.08.2026 die `fallback`-Kette DIESER Datei, gelegt von
 *     `services/ai/fallbackModel.ts` um das zurückgegebene Modell. Bis dahin
 *     stand hier „KEINE Fallback-Kette, es zählt nur der `try`/`catch` des
 *     Aufrufers" — und genau so verlor `ThreadTag` an jenem Tag seine Antwort,
 *     als Regolo mit HTTP 402 (`trial_expired`) abwies.
 *
 * F1 (CLAUDE.md): Stufennamen und Modell-IDs sind interne IDs und werden nicht
 * umbenannt.
 */

import { GEMMA_31B_ALTERNATE, GEMMA_31B_PRIMARY } from './gemmaHosts.js';

import type { ProviderName } from './providers.js';

export interface LaneTarget {
  readonly provider: ProviderName;
  readonly model: string;
}

export interface IntermediateLaneConfig extends LaneTarget {
  /**
   * Wer einspringt, wenn der Primär zu lange braucht — NICHT wenn er ausfällt,
   * dafür ist `fallback` da. Der Aufrufer bestimmt, ab wann „zu lange" gilt,
   * und schaltet den Sibling dann PARALLEL dazu (siehe `runStep` in
   * routes/chat/services/agentPipeline.ts).
   *
   * Warum das hier steht und nicht beim Aufrufer: welches Modell für dieselbe
   * Aufgabe taugt, ist eine Messfrage, und die Messungen stehen in dieser Datei.
   */
  readonly hedge?: LaneTarget;
  /**
   * Wer übernimmt, wenn der Primär FEHLSCHLÄGT — der Reihe nach, nacheinander.
   *
   * PFLICHTFELD, und das ist der ganze Punkt: bis zum 29.08.2026 hatten diese
   * Stufen gar keine Kette. Der Kommentar zur Ausfallsicherheit oben sagte es
   * schon — wer sein Modell über `getIntermediateModel()` holt und direkt
   * `generateText` ruft, umgeht die Fassade und damit `providerFallback.ts`.
   * An diesem Tag antwortete Regolo mit HTTP 402 (`trial_expired`), und die
   * Auto-Verschlagwortung (`trivial`) gab still auf. Ein optionales Feld hätte
   * dieselbe Lücke gelassen, nur später; deshalb muss jede Stufe eine Kette
   * nennen, und ein Wächter in `__tests__/intermediateFallback.vitest.ts`
   * besteht darauf.
   *
   * Zwei Regeln, beide aus Messungen in dieser Datei:
   *
   * 1. **Jede Stufe ein anderer Vertragspartner.** Derselbe Grund wie beim
   *    Hedge: ein Anbietereinbruch nimmt sonst die ganze Kette. Der Vorfall vom
   *    29.08. war ein KONTO-Problem (Tageslimit), kein Modellproblem — ein
   *    zweites Modell beim selben Anbieter hätte denselben 402 bekommen.
   * 2. **Kein Reasoning-Modell in einer Stufe mit kleinem Ausgabebudget.**
   *    `trivial` und `standard` rufen mit `maxOutputTokens` 16–40 auf. Bei
   *    einem Reasoning-Modell zählen die Denk-Tokens dagegen, `content` kommt
   *    leer zurück (Messreihe im Kopf dieser Datei, gpt-oss-120b: 0 von 90
   *    Läufen brauchbar). `litellm/verdigado-pro` ist deshalb dort KEIN
   *    Auffangnetz, sondern eine zweite Art zu scheitern — es steht bewusst
   *    nicht in diesen beiden Ketten.
   */
  readonly fallback: readonly LaneTarget[];
}

/** Der Ausgangszustand: was `INTERMEDIATE_MODEL` für alle 36 Stellen war. */
const REGOLO_SMALL_4 = { provider: 'regolo', model: 'mistral-small-4-119b' } as const;

/**
 * Die vier Glieder der kleinen Stufen: DREIMAL dasselbe Modell auf drei Hosts,
 * dann ein viertes als Rest.
 *
 * `mistral-small-3.2-24b-instruct-2506` liegt bei GreenPT, bei Cortecs (über
 * `ovh`/`scaleway`/`berget`) und in verwandter Form bei Mistral selbst. Dass
 * die ersten drei Glieder dieselben Gewichte tragen, ist die Absicht: ein
 * Hostwechsel darf die Antwortqualität nicht mit umschalten, sonst ist der
 * Fallback ein stiller Modellwechsel. Erst das vierte Glied wechselt das
 * Modell.
 *
 * `greenpt/mistral-small-3.2-24b` ist NICHT neu im System: es bedient seit dem
 * 13.08.2026 den Planer des agentischen Loops (`LOOP_PLANNER_PRIMARY`) und seit
 * dem 19.08.2026 den Monitor. Es denkt nicht (verbrennt das kleine
 * Ausgabebudget also nicht im `reasoning`-Feld), ruft nachweislich Werkzeuge
 * auf (genau das ist die Planer-Rolle) und meldet als einziges Glied seinen
 * Energieverbrauch selbst zurück — womit die grösste Lane im System zum ersten
 * Mal beziffert in der CO₂-Übersicht auftaucht statt als „nicht abgedeckt".
 *
 * `cortecs/mistral-small-3.2-24b-instruct-2506` ist das zweite Glied und
 * bewusst DASSELBE Modell: gemessen am 29.08.2026 gegen den lebenden Endpunkt,
 * 3 Läufe, `max_tokens: 16` — HTTP 200, `content: 'ja'`, `finish_reason: stop`,
 * 338/404/463 ms, Upstream `ovh`. Der Katalog ist hier nicht die Quelle (er
 * hat bei `gemma-4-31b-it` schon Bildfähigkeit versprochen, die mit HTTP 500
 * antwortete); geprüft wurde der Endpunkt.
 *
 * `mistral/mistral-small-latest` ist das dritte Glied — dritter
 * Vertragspartner, kein Reasoning-Modell, gemessener Energie-Koeffizient
 * (services/usage/energyFootprint.ts), im Repo bereits in Gebrauch
 * (promptAssemblyGraph, argumentsSummarizer).
 *
 * `regolo/mistral-small-4-119b` steht als LETZTES. Es war bis zum 29.08.2026
 * der Primär dieser beiden Stufen; an diesem Tag wies das Konto mit HTTP 402
 * (`trial_expired`) ab, und weil es primär war, hatte die Auto-Verschlagwortung
 * nichts dahinter. Es bleibt in der Kette, weil ein vierter Vertragspartner
 * mehr wert ist als eine kurze Kette — aber nicht mehr vorn.
 */
const GREENPT_SMALL_32 = {
  provider: 'greenpt',
  model: 'mistral-small-3.2-24b-instruct-2506',
} as const;
/** Exportiert, weil `litellmRetired.ts` dasselbe Ziel braucht: der stillgelegte
 *  Verdigado-Alias `verdigado-pro` landet genau hier. Ein zweiter, handnotierter
 *  Modellname dort wäre die Art Doppelung, die diese Datei einsammelt. */
export const CORTECS_SMALL_32 = {
  provider: 'cortecs',
  model: 'mistral-small-3.2-24b-instruct-2506',
} as const;
const MISTRAL_SMALL = { provider: 'mistral', model: 'mistral-small-latest' } as const;

/** Die eine Kette der beiden kleinen Stufen. Sie teilen sie, weil sie dieselbe
 *  Arbeit in verschiedenem Tempo tun — die Stufen unterscheiden sich im
 *  Zeitbudget des Aufrufers, nicht in der Frage, wer einspringt. */
const SMALL_CHAIN = [CORTECS_SMALL_32, MISTRAL_SMALL, REGOLO_SMALL_4] as const;

/**
 * Das dichte Gemma 4 31B — Primär und Ausweich kommen beide aus `gemmaHosts.ts`.
 *
 * Hier steht KEIN Host und KEIN Modellname mehr. Diese Stufen waren zwei von
 * sechs Stellen, die den Gemma-Host je einzeln notierten; welcher Anbieter ihn
 * bedient, entscheidet seit dem 25.08.2026 ausschliesslich jene Datei. Die
 * Begründung für die aktuelle Wahl steht dort, die Begründung dafür, dass
 * `pruefung` überhaupt ZWEI Seiten hat, unten bei der Stufe.
 *
 * Der Ausweich ist bewusst der jeweils ANDERE Vertragspartner und kein
 * Reservemodell: ein Einbruch bei einem Anbieter nimmt sonst beide Seiten.
 */
const GEMMA_PRIMARY = GEMMA_31B_PRIMARY;
const GEMMA_HEDGE = GEMMA_31B_ALTERNATE;

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
  trivial: { ...GREENPT_SMALL_32, fallback: SMALL_CHAIN },

  /**
   * Der Hot Path: kurze Ausgabe, harte Zeitsperren, Routing-Wirkung.
   * Verschiebt nur, wer die Latenz unter Last gemessen hat.
   *
   * Die Aufrufer und ihre Sperren, weil genau die den Spielraum dieser Stufe
   * bestimmen (Stand 29.08.2026, alle über `pinned: 'standard'` an der
   * Fassade — der einzige direkte ist `researchOrchestrator`):
   *
   *   editTargetResolver        8 Tokens    900 ms   ← engste Sperre
   *   generationResolver       16 Tokens   1500 ms
   *   docsIntentTiebreak       16 Tokens   1500 ms
   *   queryRefineResolver     200 Tokens   2500 ms
   *   PassageDistiller           —         3500 ms
   *   qualityGateNode          80 Tokens     —
   *   briefGeneratorNode      200 Tokens     —
   *   QueryExpansionService      —            —
   *
   * Dazu ZWEI Konstanten, die die Stufe weiterreichen und beim Zählen leicht
   * übersehen werden: `LANE` in `services/ai/lanes.ts` (bedient `image_picker`,
   * `antrag_question_generation`, `antrag_qa_summary`, `gruenerator_ask`,
   * `gruenerator_ask_grundsatz`) und `LANE` in
   * `services/providers/providerSelector.ts` als Durchfall-Default.
   *
   * Eine gerissene Sperre liefert `null`, der Turn fällt auf Tier 4 durch und
   * zahlt den 27k-Zeichen-Prompt — die Quote, die die Dispositions-Serie
   * (#2272–#2279) von 18,1 % auf 3,0 % gedrückt hat. Das ist der Preis, den
   * eine zu langsame Wahl hier kostet, und er steht nicht in den Latenzzahlen.
   */
  standard: { ...GREENPT_SMALL_32, fallback: SMALL_CHAIN },

  /**
   * Die Qualitätslatte: Zusammenfassungen, der Boards-Agent,
   * Deep-Research-Planung. (Die mem0-Extraktion war bis 01.09.2026 der vierte
   * Abnehmer; das explizite Gedächtnis in `services/memory/` ruft kein Modell.)
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
   * Energie-Koeffizient, und weder Scaleway noch Cortecs melden Verbrauch
   * zurück. `heavy` fällt damit aus der CO₂-Übersicht (siehe
   * services/usage/energyFootprint.ts). Das Pariser Netz (24 g/kWh gegen
   * Regolos 270) spricht dafür, dass die reale Bilanz besser wird — beziffern
   * lässt sie sich nicht mehr. Schätzen aus der Geschwindigkeit lag im Repo
   * schon einmal um 62 % daneben.
   *
   * ── 21.08.2026: zurück auf das dichte 31B ──
   *
   * Diese Stufe fuhr seit dem 01.08.2026 die MoE-Variante `gemma-4-26b-a4b-it`,
   * und die Begründung oben gilt für sie unverändert. Sie ist trotzdem weg, aus
   * einem Grund, der nichts mit Qualität zu tun hat: das MoE war über Cortecs
   * an EINEN Unterauftragnehmer gebunden (scaleway), und der verschwand an
   * diesem Tag binnen einer Stunde aus dem Katalog — derselbe Aufruf, der um
   * 15:52 lief, antwortete um 16:31 mit
   * `No endpoint passed quantization_filter. Details: {scaleway: Provider not
   * in allowed providers}, {aki: Endpoint uses quantization}`. Der zweite
   * Endpunkt war quantisiert und fiel durch den Standardfilter, `scaleway
   * direkt` lief zur selben Zeit einwandfrei.
   *
   * Das dichte 31B lag zu diesem Zeitpunkt bei infercom UND berget — und liegt
   * dort wieder: die Gegenbehauptung vom 25.08.2026 ist am 29.08. live
   * widerlegt (Messung in services/ai/gemmaHosts.ts). Die tragende Reserve
   * dieser Stufe bleibt trotzdem der Regolo-Hedge unten, weil er ein anderer
   * VERTRAGSPARTNER ist; der zweite Cortecs-Endpunkt hilft nur, solange Cortecs
   * als Ganzes gesund ist. Der Preis der MoE-Ablösung ist der dokumentierte: sie antwortete
   * rund doppelt so schnell. Bezahlt wird er für Verfügbarkeit.
   *
   * KEIN Denk-Pin für dieses Modell — und das ist kein Versäumnis: infercom
   * weist `reasoning_effort` mit HTTP 400 ab, weshalb die Whitelist in
   * cortecsRequestPolicy.ts es bewusst nicht führt. Es denkt von sich aus
   * nicht (gemessen 21.08.2026: 420 Zeichen Inhalt, 0 Zeichen Denken, ohne
   * jeden Parameter), die Falle unten greift hier also nicht.
   *
   * MUSS MITKOMMEN, wenn diese Stufe je wieder ein DENKENDES Modell fährt: der
   * Client braucht dann einen erzwungenen `reasoning_effort: 'none'`
   * (cortecsRequestPolicy.ts). Ohne den antwortete das MoE mit LEEREM
   * `content` — auch bei max_tokens 1500, nach 5386 Zeichen Reasoning. Leerer
   * Inhalt ist für die Fassade kein Fehler, sondern startet die Fallback-Kette;
   * `classifyDeliverable` mit seinen 20 Token stirbt zuerst.
   *
   * Historisch (mem0 ist seit 01.09.2026 weg, die Falle bleibt lehrreich):
   * mem0s Extraktion folgte dieser Stufe zuletzt wieder (31.08.2026, #3065). Sie tat
   * es zwischendurch nicht: `services/mem0/config.ts` band `REGOLO_BASE_URL` +
   * `REGOLO_API_KEY` fest an den Modellnamen VON HIER und hätte bei einem Umzug
   * dieser Stufe einen fremden Namen an Regolos Basis-URL geschickt. Der Pin
   * war die Antwort darauf, die falsche: die Stelle nimmt jetzt das aufgelöste
   * MODELL statt seines Namens, und mit ihm den Transport — ein Umzug hier
   * erreicht sie also von selbst und richtig. Siehe den Kopf jener Datei.
   */
  heavy: {
    provider: GEMMA_PRIMARY.provider,
    model: GEMMA_PRIMARY.model,
    // Erst dieselben Gewichte beim anderen Vertragspartner — das ist die Lane,
    // die diese Stufe ohnehin kennt (GEMMA_31B_ALTERNATE). Dahinter Mistral
    // Medium 3.5, weil `heavy` lange Prosa schreibt und ein drittes Glied
    // dieser Güte braucht, nicht ein kleines Modell.
    fallback: [
      { provider: GEMMA_HEDGE.provider, model: GEMMA_HEDGE.model },
      { provider: 'mistral', model: MISTRAL_MEDIUM },
    ],
  },

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
  compute: {
    provider: 'mistral',
    model: MISTRAL_MEDIUM,
    // Die Reihenfolge steht in der Tabelle oben: Gemma 4 traf 100,0 % der
    // 17 Rechenfälle, Small 4 nur 94,1 %. Auf dieser Stufe ist ein Fehler eine
    // FALSCHE ZAHL beim Nutzer — die Kette folgt deshalb der Trefferquote und
    // nicht dem Energiewert.
    fallback: [{ provider: GEMMA_PRIMARY.provider, model: GEMMA_PRIMARY.model }, REGOLO_SMALL_4],
  },

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
   * Modell: das dichte 31B, auf BEIDEN Seiten dasselbe — Primär über Cortecs,
   * Ausweich auf Regolo. Es ist NICHT dasselbe wie `heavy`: diese Stufe zog am
   * 01.08.2026 auf die MoE-Variante um, weil die mit 4B aktiven Parametern
   * rund doppelt so schnell antwortet, und kam zurück, weil das dichte 31B den
   * Prüfbericht ausdrücklich besser trägt.
   *
   * ── 21.08.2026: warum Cortecs den Primär bekommt ──
   *
   * Gemessen am Prüf-Prompt, gestreamt, verschränkt, mit Aufwärmlauf, je fünf
   * ruhige Läufe und vier gleichzeitige:
   *
   *                        TTFT     Durchsatz    gesamt
   *   regolo/gemma4-31b     129 ms   81,3 tok/s   5,06 s
   *   cortecs (infercom)   1122 ms  210,7 tok/s   2,81 s
   *
   * Regolo antwortet neunmal schneller AN, Cortecs generiert 2,6-mal schneller.
   * Der Gleichstand liegt bei rund 130 Ausgabe-Tokens — und diese Stufe hat
   * einen Deckel von 11.000. Auf einen ~3.000-Token-Bericht gerechnet: Regolo
   * 0,13 + 36,9 = 37 s, was die am 14.08.2026 gemessenen 35,9 / 36,9 s genau
   * trifft; Cortecs 1,1 + 14,2 = 15 s. Die Sekunde Anlauf ist bei dieser
   * Ausgabelänge belanglos, zumal die Kette hinter einer bereits gestreamten
   * Antwort läuft.
   *
   * Inhaltstreue war in 22 Läufen nicht unterscheidbar: beide Hosts fanden
   * jedes Mal eine eingebaute Auslassung UND einen Zahlendreher, mit
   * Abdeckungstabelle und Gesamturteil, ohne die Regeln der Einfachen Sprache
   * fälschlich als Mangel zu melden. Messwerkzeug:
   * `scripts/probeGemma31Hosts.ts`.
   *
   * ── 14.08.2026: warum es überhaupt zwei Seiten gibt ──
   *
   * Regolos `gemma4-31b` antwortete an diesem Tag mit **3,7 tok/s** statt der
   * sonst gemessenen ~76. Regolo selbst war gesund (sein `mistral-small-4-119b`
   * lief mit 113 tok/s), es war dieses eine Modell dort. Ein Prüfbericht, der
   * ruhig 36 s braucht, brauchte 218 s und riss die Zeitsperre — auf dieselben
   * 3.000 Tokens gerechnet wären es 810 s gewesen.
   *
   * Der Ausweich ist deshalb kein Reservemodell, sondern derselbe Prüfer auf
   * einem anderen Vertragspartner: der Aufrufer schaltet ihn nach einer Frist
   * PARALLEL dazu. Dass Primär und Ausweich bei verschiedenen Anbietern liegen,
   * ist die ganze Absicht — ein Einbruch nimmt sonst beide Seiten. Dass Cortecs
   * `berget` als zweiten Endpunkt in der Hinterhand hat, stand hier, wurde am
   * 25.08.2026 als widerlegt gestrichen und ist seit dem 29.08.2026 wieder
   * belegt (Messung in services/ai/gemmaHosts.ts). Es ändert an dieser Stufe
   * nichts: was den Ausfallweg vom 14.08. trug, waren zwei
   * VERTRAGSPARTNER, nicht zwei Endpunkte innerhalb eines Routers.
   *
   * GreenPTs `gemma4` wäre der dritte Kandidat und ist es NICHT: welche
   * Gewichte es trägt, ist unbelegt (siehe GEMMA_4_GREENPT in
   * routes/chat/agents/providers.ts), und ein stilles Qualitätsgefälle ist
   * ausgerechnet beim Prüfschritt der teuerste Fehler.
   */
  pruefung: {
    provider: GEMMA_PRIMARY.provider,
    model: GEMMA_PRIMARY.model,
    hedge: { provider: GEMMA_HEDGE.provider, model: GEMMA_HEDGE.model },
    // Dasselbe Ziel wie der Hedge, aber ein anderer Auslöser: der Hedge greift
    // bei ZÄH (parallel, nach einer Frist), diese Kette bei FEHLSCHLAG
    // (nacheinander). Beides ist nötig — der Vorfall vom 14.08.2026 war zäh
    // (3,7 tok/s), der vom 29.08.2026 war ein harter 402.
    fallback: [
      { provider: GEMMA_HEDGE.provider, model: GEMMA_HEDGE.model },
      { provider: 'mistral', model: MISTRAL_MEDIUM },
    ],
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
