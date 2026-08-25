/**
 * Welche der montierten Werkzeuge dieser Turn dem Modell tatsächlich ZEIGT.
 *
 * Der Katalog wird weiter vollständig gebaut — hier wird nur entschieden, was
 * davon in den Request wandert (`activeTools`, AI SDK v7). Der Unterschied ist
 * der Punkt: ein zurückgestelltes Werkzeug existiert, ist aufrufbar, und kostet
 * bis dahin nichts.
 *
 * ── Warum: gemessen am 25.08.2026 ──
 *
 * Der Werkzeugkatalog ist der grösste Einzelposten jedes werkzeugtragenden
 * Aufrufs. Gemessen mit `scripts/measureToolCatalog.ts` (Serialisierung über
 * `asSchema`, also das, was der Provider sieht) und gegengeprüft an den echten
 * `prompt_tokens`, die `mistral-medium-2604` zurückmeldet
 * (`scripts/measureCatalogPromptTokens.ts`). Turn: "Was steht im Wahlprogramm
 * zu Windkraft?"
 *
 *                          Werkzeuge   prompt_tokens
 *   vorher                        20           6.777
 *   nachher (inkl. Lader)         13           4.131   −2.646 (39 %)
 *
 * Die acht Werkzeuge für die eigenen Inhalte der Person hingen bis dahin an
 * `state.enabledTools` — also an einer Einstellung, die kaum jemand umlegt —
 * und gingen damit auf JEDEM Turn mit, auch auf einer reinen Programmfrage.
 *
 * Mitgemessen, weil es die Annahme unter allem ist: derselbe Aufruf mit dem
 * VOLLEN Katalog plus `prepareStep`-Schnitt kommt auf denselben Wert wie die
 * vorgefilterte Menge (4.131 = 4.131). Das SDK wendet `activeTools` also VOR
 * dem Request an; die Ersparnis ist gemessen, nicht angenommen.
 *
 * Die Rechnung dahinter: 95,7 % aller Tokens der Plattform sind Eingabe
 * (83,5 von 87,3 Mio. in 90 Tagen, `/api/transparency/usage`), und nichts davon
 * wird zwischengespeichert — GreenPT, Regolo und Scaleway machen nur
 * serverseitiges Prefix-Caching, das Latenz spart und nicht Tokens.
 *
 * ── Warum ein Lader und nicht bloss ein Tor ──
 *
 * Ein Tor, das aus dem Text schliesst, hat einen Rückruf: erkennt es den Turn
 * nicht, fehlt dem Modell eine Fähigkeit, und es antwortet "deine Dokumente
 * sehe ich nicht" — der teuerste denkbare Fehler für 2.646 gesparte Tokens.
 * Deshalb bleibt IMMER ein Lader montiert (gemessen 188 Tokens; die 2.834 der
 * Gruppe minus dieser Rückweg sind die 2.646 oben). Ein Fehlschluss des Tors
 * kostet damit einen zusätzlichen Schritt, nie die Fähigkeit.
 *
 * Ob das Tor im Betrieb zu oft oder zu selten schliesst, steht in der
 * Turn-Zeile: `deferred=N` (turnSummary.ts). `0` heisst offen oder geladen.
 *
 * Bekannte Grenze, gemessen: eine Frage nach einem eigenen Inhalt, die weder
 * ein Substantiv aus den Listen unten noch einen Selbstbezug trägt — "Wo liegt
 * eigentlich die Rede von letzter Woche?" — bleibt zu, und der Planer sucht
 * dann im Web. "Rede" aufzunehmen wäre falsch: das öffnete die Gruppe auf jedem
 * Redenschreib-Turn.
 *
 * F1 (CLAUDE.md): Gruppen-IDs und der Name des Laders sind interne IDs und
 * werden nicht umbenannt.
 */
import { tool } from 'ai';
import { z } from 'zod';

import type { ToolSet } from 'ai';

/**
 * Wann die eigenen Inhalte gemeint sind.
 *
 * Live gemessen am 25.08.2026 gegen LOOP_PLANNER_PRIMARY
 * (`scripts/probeToolScopeRecall.ts`): ein blosser Possessiv-Test reichte NICHT.
 * Von fünf Turns ohne Possessiv fand der Planer den Lader dreimal — und lag
 * zweimal daneben, davon einmal auf die teuerste Art:
 *
 *   "Zeig mir die Aufgabe zum Radentscheid"  → web_search
 *   "Welche Notizbücher gibt es?"            → "Ich kenne folgende Notizbücher:"
 *
 * Der zweite Fall ist der Grund für diese Aufteilung: das Modell ERFAND die
 * Antwort, statt den Rückweg zu nehmen. Der Lader ist ein Netz, kein Tor.
 *
 * ── Zwei Klassen von Substantiven, und warum ──
 *
 * PRODUKT: Wörter, die in diesem Produkt fast nur eigene Objekte meinen. Sie
 * öffnen allein. `sharepic` und `reel` stehen bewusst NICHT dabei — "mach ein
 * Sharepic zum Tempolimit" ist ein Erstellungs-Turn, und der hat sein eigenes,
 * immer montiertes Werkzeug.
 *
 * ALLGEMEIN: Wörter, die genauso gut Parteiinhalte meinen ("das Wahlprogramm
 * ist ein Dokument", "die Aufgabe der Politik"). Sie öffnen nur zusammen mit
 * einem Possessiv, einem ABRUF-Verb oder "… habe ich".
 *
 * Die Richtung der Fehler ist Absicht: ein Treffer zu viel kostet den vollen
 * Katalog, ein Treffer zu wenig kostet einen Schritt — und im schlimmsten Fall
 * eine erfundene Antwort. Deshalb im Zweifel öffnen.
 *
 * KEIN `\b` hinter den Substantiven: `\b` gilt zwischen Wort- und
 * Nicht-Wort-Zeichen, und Umlaute sind für JS-Regex Nicht-Wort-Zeichen — ein
 * `\b` hinter `notizb\w*` würde ausgerechnet bei "Notizbücher" greifen wollen
 * und tut es nicht. Am Wortende bleibt das Muster deshalb offen; das lässt
 * zugleich Zusammensetzungen wie "Klimaboard" durch.
 */
const PRODUKT_SUBSTANTIV = String.raw`(notizb|board|chatverlauf|unterhaltung|thread)`;
const ALLGEMEINES_SUBSTANTIV = String.raw`(dokument|aufgab|task|to-?do|projekt|datei|gruppe|inhalt|medi|sammlung|sharepic|reel|karte)`;
/**
 * Wortgrenzen von Hand, weil `\b` hier zweimal falsch ist: `ä`, `ö`, `ü` und `ß`
 * sind für JS-Regex NICHT-Wort-Zeichen. `\b(öffne)` scheitert am Satzanfang (vor
 * `ö` steht nichts, also verlangt `\b` dort ein Wort-Zeichen — es gibt keins),
 * und `(meine)\b` würde vor einem Umlaut fälschlich greifen. Genau daran ist der
 * erste Entwurf gescheitert: "Öffne das Dokument Haushaltsrede" blieb zu.
 */
const VOR = String.raw`(?<![\wäöüß])`;
const NACH = String.raw`(?![\wäöüß])`;
const POSSESSIV = `${VOR}(mein|meine|meiner|meinem|meinen|unser|unsere|unserer|unserem|unseren)${NACH}`;
/** Abrufen, nicht erstellen: "zeig", "welche", "öffne" — NICHT "schreib", "mach". */
const ABRUF = `${VOR}(zeig|zeige|öffne|oeffne|finde|find|such|suche|durchsuche|durchsuch|liste|list|leg|lege|füge|fuege|nenne|nenn|welche|welches|welcher|wieviele|hab|habe)${NACH}`;
const LUECKE = String.raw`[\s\wäöüß-]{0,40}`;

/**
 * Selbstbezug ohne jedes Substantiv — "steht da noch was Offenes für mich?",
 * "ich suche was, das ich neulich abgelegt hatte". Live am 25.08.2026 die
 * einzige Klasse, in der der Planer ohne Not eine NEGATIVE Antwort erfand
 * ("Ich sehe keine offenen Aufgaben für dich"), statt den Lader zu rufen. Eine
 * erfundene Fehlanzeige ist schlimmer als eine erfundene Auskunft: sie sieht
 * aus wie eine geprüfte Antwort.
 */
const SELBSTBEZUG = String.raw`(für mich|fuer mich|bei mir|von mir|ich${LUECKE}(abgelegt|gespeichert|angelegt|erstellt|geschrieben|hinterlegt))`;

const MEINE_INHALTE_RE = new RegExp(
  [
    PRODUKT_SUBSTANTIV,
    SELBSTBEZUG,
    `${POSSESSIV}${LUECKE}${ALLGEMEINES_SUBSTANTIV}`,
    `${ABRUF}${LUECKE}${ALLGEMEINES_SUBSTANTIV}`,
    `${ALLGEMEINES_SUBSTANTIV}${LUECKE}${POSSESSIV}`,
  ].join('|'),
  'i'
);

/**
 * Eine Gruppe, die erst auf Zuruf mitgeschickt wird.
 *
 * `hint` entscheidet, ob sie schon zu Beginn offen steht. Es ist bewusst
 * grosszügig: ein falsch POSITIVER Treffer kostet Tokens (den Zustand von
 * vorher), ein falsch negativer nur einen Schritt.
 */
interface DeferrableGroup {
  readonly id: string;
  readonly loaderTool: string;
  readonly tools: readonly string[];
  readonly hint: RegExp;
  readonly loaderDescription: string;
  /** Was der Lader zurückgibt, wenn er die Gruppe geöffnet hat. */
  readonly opened: string;
}

export const DEFERRABLE_GROUPS = [
  {
    id: 'meine_inhalte',
    loaderTool: 'meine_inhalte_laden',
    tools: [
      'find_content',
      'search_threads',
      'documents',
      'read_artifact',
      'boards_tasks',
      'groups',
      'media',
      'notebooks',
    ],
    hint: MEINE_INHALTE_RE,
    loaderDescription:
      'Schaltet die Werkzeuge für die EIGENEN Inhalte der Person frei: Dokumente, Boards/Aufgaben, Notizbücher, Projekte, Medien und frühere Unterhaltungen.\n\nNUTZE WENN die Frage sich auf Inhalte der Person selbst bezieht ("meine Aufgaben", "welches Dokument habe ich zu X", "leg das in mein Notizbuch"). Sie stehen dann im nächsten Schritt bereit. NICHT für Partei-Recherche oder Websuche.',
    opened:
      'Werkzeuge für die eigenen Inhalte sind jetzt verfügbar: find_content, search_threads, documents, read_artifact, boards_tasks, groups, media, notebooks. Rufe im nächsten Schritt das passende auf.',
  },
] as const satisfies readonly DeferrableGroup[];

export type DeferrableGroupId = (typeof DEFERRABLE_GROUPS)[number]['id'];

export interface ToolScope {
  /**
   * Die Namen, die dieser Schritt mitschickt — oder `undefined`, wenn nichts
   * zurückgestellt ist. `undefined` heisst "kein Eingriff": genau dann verhält
   * sich der Turn wie vor dieser Datei.
   */
  activeTools(): readonly string[] | undefined;
  /** Öffnet eine Gruppe für alle FOLGENDEN Schritte. */
  open(id: DeferrableGroupId): void;
  /** Die Lader-Werkzeuge der noch geschlossenen Gruppen, fertig zum Montieren. */
  loaderTools(): ToolSet;
  /** Für die Protokollzeile am Turn-Ende. */
  deferredToolNames(): readonly string[];
}

/**
 * @param toolNames  Was der Katalog für diesen Turn WIRKLICH montiert hat. Die
 *   Gruppen werden dagegen geschnitten — eine Gruppe, deren Werkzeuge ohnehin
 *   nicht montiert sind (abgeschaltet, kein Loop), gibt es hier nicht.
 * @param userText  Der Text der Person, ohne Erwähnungs-Label — dieselbe Form,
 *   die auch `toolCatalog` für seine Tore liest.
 * @param pinnedTool  Ein von einer @-Erwähnung festgezurrtes Werkzeug
 *   (`mentionPinnedTool`). MUSS die Gruppe öffnen, in der es liegt: das Label
 *   der Erwähnung ist aus `userText` entfernt, das Tor sieht die Absicht also
 *   gar nicht — und `pinnedFirstTool` erzwingt dieses Werkzeug auf Schritt 0.
 *   Ohne diese Zeile widerspräche sich der Turn selbst.
 */
export function createToolScope(params: {
  toolNames: readonly string[];
  userText: string;
  pinnedTool?: string | null;
}): ToolScope {
  const mounted = new Set(params.toolNames);
  const text = params.userText ?? '';
  const pinned = params.pinnedTool ?? null;

  // Nur Gruppen, die diesen Turn überhaupt etwas zurückhalten könnten.
  const closed = new Map<string, DeferrableGroup>();
  for (const group of DEFERRABLE_GROUPS) {
    const present = group.tools.filter((t) => mounted.has(t));
    if (present.length === 0) continue;
    if (group.hint.test(text)) continue;
    // `tools` ist ein Literal-Tupel, `pinned` kommt als beliebiger String aus
    // dem Zustand — die Verbreiterung ist die Grenze, nicht ein Typloch.
    if (pinned && (group.tools as readonly string[]).includes(pinned)) continue;
    closed.set(group.id, { ...group, tools: present });
  }

  return {
    activeTools() {
      if (closed.size === 0) return undefined;
      const hidden = new Set<string>();
      for (const group of closed.values()) for (const t of group.tools) hidden.add(t);
      // Die Lader stehen nicht in `toolNames` — sie werden erst nach diesem
      // Aufruf montiert. Deshalb ausdrücklich anhängen, sonst schneidet
      // `activeTools` genau den Rückweg weg.
      const loaders = [...closed.values()].map((g) => g.loaderTool);
      return [...params.toolNames.filter((t) => !hidden.has(t)), ...loaders];
    },
    open(id) {
      closed.delete(id);
    },
    loaderTools() {
      const tools: ToolSet = {};
      for (const group of DEFERRABLE_GROUPS) {
        if (!closed.has(group.id)) continue;
        tools[group.loaderTool] = tool({
          description: group.loaderDescription,
          inputSchema: z.object({}),
          execute: async () => {
            closed.delete(group.id);
            return { geoeffnet: true, hinweis: group.opened };
          },
        });
      }
      return tools;
    },
    deferredToolNames() {
      return [...closed.values()].flatMap((g) => g.tools);
    },
  };
}
