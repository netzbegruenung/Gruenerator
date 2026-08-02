/**
 * "Braucht dieser Turn eine bereitgestellte Live-Quelle — und welche?"
 *
 * Der Nachfolger von `SYSTEM_MCP_PHRASING` + `sourceScopeResolver`. Beide
 * zusammen beantworteten dieselbe Frage in zwei Stufen: ein grosszügiger Regex
 * hielt Kandidaten von der Loop-Demotion zurück, ein 900-ms-Modellaufruf
 * entschied dann, welche Quelle es ist. Das war die Arbeitsteilung, solange die
 * Antwort ein INTENT sein musste — ein Intent ist einwertig, also musste sich
 * jemand festlegen.
 *
 * Connectoren sind nicht einwertig. Die Antwort darf jetzt "bahn UND wetter"
 * sein, und wer sich am Ende festlegt, ist das Modell im Loop, das den Turn
 * ohnehin sieht. Damit fällt die zweite Stufe weg, und übrig bleibt die Frage,
 * die ein Regex tatsächlich beantworten kann: welches Vokabular kommt vor.
 *
 * ── ES IST EIN GITTER, KEIN KLASSIFIKATOR ──────────────────────────────────
 *
 * Ein Treffer MOUNTET Werkzeuge und öffnet den Loop. Er beantwortet nichts. Ein
 * Fehltreffer kostet Tokens und einen Loop statt eines Einzelschritts — er
 * erzeugt keine falsche Antwort, weil das Modell die Werkzeuge nicht rufen muss.
 * Deshalb darf das Vokabular grosszügig sein, wo es sich lohnt, und muss dort
 * eng sein, wo es teuer ist.
 *
 * Vorher war ein Fehltreffer noch billiger (ein Modellaufruf, danach ging der
 * Turn dorthin, wo er ohnehin hingehört hätte). Diese Absicherung gibt es nicht
 * mehr — was hier matcht, liegt im Katalog. Das ist der Grund, warum das
 * Gesetzes-Vokabular unten so viel enger ist als das der vier geerbten Quellen.
 *
 * ── GRENZEN MIT `\p{L}`, NICHT MIT `\b` ────────────────────────────────────
 *
 * `\b` ist in JS ASCII-only: zwischen Leerzeichen und "ü" liegt keine
 * Wortgrenze, weil beide kein `\w` sind. Jede Alternative, die mit einem Umlaut
 * beginnt, wäre damit tot (`regex-umlaut-word-boundary-dead`). `(?<!\p{L})…(?!\p{L})`
 * mit `u`-Flag ist das Idiom im ganzen Klassifikator.
 *
 * Die NACHLAUFENDE Grenze macht nebenbei die Politik-Abgrenzung: "Bahnreform",
 * "Wetterextreme" und "Tourismuspolitik" sind Komposita, deren Trigger-Wort ein
 * Buchstabe folgt — sie matchen nicht, ohne dass es eine Verbotsliste braucht.
 * Das ist die Eigenschaft, die `classifierSourceScopeReach.vitest.ts` seit dem
 * Vorgänger festhält, und sie wird hier weiter geprüft.
 */

import { type SystemMcpKey } from '../../../../services/mcp/systemMcpServers.js';

/**
 * Vokabular je Quelle.
 *
 * Die vier ersten sind `SYSTEM_MCP_PHRASING` aufgeteilt, Alternative für
 * Alternative — inklusive der vier Formulierungen, die am 31.07.2026 nachgemessen
 * und ergänzt wurden ("wo kann ich in X übernachten", Pollen, "was gibt es Neues
 * zu X", "aktuelle Nachrichten aus Y").
 */
const SOURCE_PATTERNS: ReadonlyArray<readonly [SystemMcpKey, readonly RegExp[]]> = [
  [
    'bahn',
    [
      /(?<!\p{L})(bahn(?:en|h(?:o|ö)f\p{L}*)?|z(?:ü|ue)ge|zugverbindung\p{L}*|fahrplan\p{L}*|abfahrtszeit\p{L}*|versp[äa]tung\p{L}*|zug\s+nach|verbindung\s+nach|wie\s+komme\s+ich\s+(?:\p{L}+\s+){0,6}?nach)(?!\p{L})/iu,
    ],
  ],
  [
    'hotel',
    [
      /(?<!\p{L})(hotel\p{L}*|unterkun\p{L}*|unterk[üu]nft\p{L}*|[üu]bernacht\p{L}*|absteige|pension|herberge|dienstreise\p{L}*|reiseplan\p{L}*)(?!\p{L})/iu,
    ],
  ],
  [
    'wetter',
    [
      /(?<!\p{L})(wetter|wettervorhersage|wetterbericht|regnet\s+es|schneit\s+es|pollen\p{L}*|luftqualit[äa]t\p{L}*)(?!\p{L})/iu,
    ],
  ],
  [
    'news',
    [
      /(?<!\p{L})(tagesschau|schlagzeile\p{L}*|was\s+gibt\s+es\s+neues|aktuelle\s+nachrichten|neuigkeiten)(?!\p{L})/iu,
    ],
  ],
  /**
   * Recht ist der einzige NEUE Eintrag und bewusst der engste.
   *
   * Ein blosses `gesetz\p{L}*` wäre der naheliegende Ansatz und wäre falsch:
   * "Heizungsgesetz", "Gesetzentwurf" und "Gesetzgebungsverfahren" sind das
   * Vokabular von `bundestag`, `news` und der Programmsuche — politische Rede
   * ÜBER Gesetze, nicht die Frage nach einem Normtext. Genau diese Verwechslung
   * ist der Grund, warum die vier geerbten Quellen je einen LLM-Auflöser
   * brauchten; sie hier neu einzubauen wäre ein Rückschritt.
   *
   * ZWEI Ausdrücke, weil sie sich in der Gross-/Kleinschreibung unterscheiden:
   * die Wendungen sind wie überall case-insensitiv, die Gesetzeskürzel NICHT.
   * `/i` auf der Kürzel-Liste hiesse, dass jedes beiläufige "gg", "ao" oder
   * "sgb" im Fliesstext einen Rechts-Server mountet — die Kürzel tragen ihre
   * Bedeutung in der Schreibweise.
   */
  [
    'gesetze',
    [
      /(?:§|(?<!\p{L})(?:art(?:ikel)?\.?\s*\d+|paragra(?:f|ph)\s*\d+|gesetzestext\p{L}*|rechtsgrundlage\p{L}*|gesetzlich\s+(?:geregelt|vorgeschrieben|verboten|erlaubt)|welches\s+gesetz|laut\s+gesetz|im\s+gesetz)(?!\p{L}))/iu,
      /(?<!\p{L})(?:BGB|StGB|StPO|ZPO|GG|BDSG|DSGVO|HGB|AktG|GmbHG|VwVfG|VwGO|SGB|StVO|StVG|BauGB|EnWG|GEG|TKG|UrhG|AGG|BetrVG|TVG|KSchG|AufenthG|AsylG|InsO|AO|EStG|UStG)(?!\p{L})/u,
    ],
  ],
];

/**
 * Die bereitgestellten Quellen, deren Vokabular in diesem Text vorkommt.
 *
 * Reihenfolge ist die von `SOURCE_PATTERNS` (stabil, damit Logzeilen und Tests
 * vergleichbar bleiben), nicht die des Vorkommens im Text.
 *
 * URLs werden vorher entfernt: ein Link, der zufällig "bahn" oder "wetter"
 * enthält, ist kein Auftrag — dieselbe Vorbehandlung wie am alten Gitter
 * (`classifierNode`, Tier 3.5).
 */
export function detectManagedSources(text: string): SystemMcpKey[] {
  const cleaned = (text ?? '').replace(/https?:\/\/\S+/gi, ' ');
  if (!cleaned.trim()) return [];
  const keys: SystemMcpKey[] = [];
  for (const [key, patterns] of SOURCE_PATTERNS) {
    if (patterns.some((p) => p.test(cleaned))) keys.push(key);
  }
  return keys;
}

/** Nur für Tests/Diagnose: das Vokabular einer einzelnen Quelle. */
export function managedSourcePatterns(key: SystemMcpKey): readonly RegExp[] {
  return SOURCE_PATTERNS.find(([k]) => k === key)?.[1] ?? [];
}
