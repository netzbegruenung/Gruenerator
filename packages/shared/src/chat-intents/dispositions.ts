import { type ChatIntentId } from './index.js';

/**
 * Was der Klassifikator bei diesem Verdikt eigentlich ENTSCHIEDEN hat.
 *
 * Liegt neben der Registry und nicht IN ihr — eine totale Karte statt 40
 * Einzelfelder. Der Compiler-Schutz ist derselbe (`Record<ChatIntentId, …>`
 * bricht bei jedem neuen Intent), aber die Partition ist nur so lesbar: eine
 * Disposition ist eine Aussage über die GRUPPE, und verteilt auf 40 Objekte
 * kann niemand mehr sehen, dass `hilfe` und `summary` dieselbe Antwort geben.
 * Genau diese Unlesbarkeit hat die handgepflegten Duplikate erzeugt, die hier
 * abgelöst werden.
 *
 * Die Disposition ist NICHT aus `category` ableitbar und deshalb eine eigene
 * Achse: `category: 'artifact'` enthält `save_as_doc` (artifact) neben
 * `share_doc` (gated) und `create_recurring_task` (retired), `category: 'internal'`
 * enthält `agentic` (loop) neben `direct` (prose).
 *
 * Der Umbau auf Dispositionen behauptet, dass der Klassifikator heute eine
 * feinere Frage beantwortet als nötig: 40 Intents, von denen der agentische Loop
 * die Werkzeugwahl ohnehin erneut trifft. Diese Karte ist die Messlatte für
 * genau diese Behauptung — sie ordnet jedes Verdikt der Frage zu, die es
 * beantwortet, und macht damit sichtbar, wie viel Arbeit die Feinunterscheidung
 * überhaupt leistet.
 *
 * Die Zuordnung fragt „was MUSS vor der Antwort feststehen?", nicht „wo läuft
 * es?". Das ist der Unterschied, auf den es ankommt: `hilfe`, `summary` und
 * `mcp` laufen im Loop wie jede Recherche, aber ihre Entscheidung fällt an einem
 * eigenen deterministischen Gitter und ändert, welche Werkzeuge montiert werden
 * — sie sind `gated`, nicht `loop`. `bahn`/`wetter`/`news` standen hier als
 * Gegenbeispiel („dort wählt der Auflöser nur die Quelle") und sind inzwischen
 * `retired`: dieselbe Beobachtung, zu Ende gedacht.
 *
 * ## Gemessen am 16.08.2026 (`c2fa3f568`): die Loop-Lane trägt keinen weiteren
 * Stilllegungs-Kandidaten
 *
 * Nach der D6-Welle lag nahe, dass noch mehr Intents bloss „Statuszeile plus
 * erzwungenes Werkzeug" sind. Geprüft wurden die 14 Intents der Loop-Lane
 * (`intentsWithDisposition('loop')` plus die vier `AGENTIC_EXTRA_IDS` aus
 * `agenticLoop/intents.ts`) gegen drei Bedingungen: die Lane ist `loop` UND das
 * Zielwerkzeug hängt breit im Katalog; kein eigenes Gitter und keine eigene UX
 * VOR der Loop-Wahl; die Statuszeile ist verzichtbar. **Keiner erfüllt alle
 * drei** — die erwartete Kandidatenfamilie war mit D6 aufgebraucht.
 *
 * Die Regel, die das erklärt und beim nächsten Anlauf die Messung spart: **ein
 * @-Mention ist ein Stilllegungs-Blocker.** `forcedIntentStage` läuft VOR dem
 * Entscheider (`chatGraphContractRouter`: 196 gegen 260), und `forcedTool` ist
 * in `decideRunAgentic` ein Loop-Kill-Switch. Ein erwähnbarer Intent steuert
 * also sehr wohl noch etwas, auch wenn seine Lane `loop` heisst.
 *
 * **Der Blocker ist seit Phase L nicht mehr absolut.** Eine Erwähnung kann ein
 * WERKZEUG festzurren statt eines Intents (`IntentMention.pinsTool`); der Pin
 * trägt dann selbst, was vorher der Intent trug — er hebt den Loop-Kill-Switch
 * auf und benennt den ersten Werkzeugaufruf. `umfragen` ist so gefallen und
 * steht unten mit dem Ergebnis. Was den Blocker weiterhin echt macht, ist alles
 * ANDERE, was am Verdikt hängt: ein eigenes Gitter, eine eigene UX-Stufe, ein
 * degradeTo-Ziel oder eine Statuszeile, die niemand sonst schreibt.
 *
 *   research     vom Auftrag ausgenommen · @recherche + Variante @deepresearch
 *   agentic      IST der Auffangwert (`fallbackIntentFor`: agentic → search)
 *   search       @dokumente · Ziel eben jenes Auffangs
 *   web          degradeTo-Ziel (bundestag/abgeordnetenwatch) und Auffang für
 *                umfragen/hilfe samt Query-Nachtrag
 *   compare      eigenes Quellen-Layout (`pickSynthesisMode`: Tabelle bis 3
 *                Dokumente, darüber per_doc_bullets) und eigene Degradierung
 *                auf `search` bei ≤1 Doc-Quelle
 *   examples     @beispiele · Ziel der App-Herabstufung von social_post
 *   social_post  STILLGELEGT (08/2026): die Textsorte liegt im Rezept
 *                (`instagram`/`facebook`/`twitter`/`linkedin`/`reel`), das der
 *                Einzeldurchlauf über `deriveImplicitRecipeMention` lädt —
 *                der einzige, der ersatzlos fällt statt umzuziehen
 *   pressemitteilung_examples  STILLGELEGT (Phase L): die Karte hängt am
 *                Werkzeug, nicht am Verdikt; @pressemitteilungen/@pm zurrt
 *                Werkzeug UND Rezept `presse` fest
 *   abgeordnetenwatch  @-Mention · Locale-Gitter am Werkzeug · degradeTo
 *   bundestag          @-Mention · Locale-Gitter am Werkzeug · degradeTo
 *   umfragen     STILLGELEGT (Phase L): @umfragen zurrt jetzt das Werkzeug fest
 *                statt des Intents — der einzige, bei dem die Erwähnung das
 *                Einzige war, was ihn am Leben hielt
 *   hilfe        @doku/@hilfe/@anleitung · SYSTEM_TOOL_INTENTS · eigener
 *                Tier-2.9-Zweig · sein Werkzeug heisst nicht wie er
 *                (`gruenerator_docs_search`)
 *   summary      @zusammenfassung · eigene SSE-Stufe `summarizing`
 *   mcp          Katalog wird intent-gegattert montiert, nicht breit
 *   image        `generate_image` intent-gegattert (Kosten/Kontingent)
 *
 * Das Argument trägt die statische Prüfung oben, NICHT der Zensus:
 * `classifierCensus.baseline.txt` baut einen Zustand ohne offenes Dokument,
 * ohne Anhang und ohne @-Erwähnung, eine 0 dort heisst also „vom Korpus nicht
 * ausgelöst" und nicht „kommt nicht vor". Der Zensus liefert nur die
 * Häufigkeit — `compare` steht dort bei 0 von 167, weshalb sich ein Umbau
 * genau dort am wenigsten lohnt.
 *
 * Total über `ChatIntentId` und bewusst in einer typgeprüften Datei — nicht in
 * der Testdatei daneben. `apps/api/tsconfig.json` schliesst `**\/*.vitest.ts`
 * aus, dort wäre `Record<ChatIntentId, …>` Dekoration statt Prüfung (genau so
 * sass eine unvollständige Intent-Karte in dem Test, der unvollständige
 * Intent-Karten finden sollte). Hier bricht ein neuer Intent den Build, bis
 * jemand entscheidet, welche Frage er beantwortet.
 */
export type Disposition =
  /** D1 — Bearbeitung einer offenen/erwähnten Fläche. Ressourcen-Präsenz + Änderungsverb. */
  | 'anchor'
  /** D2 — Artefakt erzeugen. Kostet eine Generierung, braucht ein Urteil VOR der Antwort. */
  | 'artifact'
  /** D3 — eigenes deterministisches Gitter mit eigener Ausführung. */
  | 'gated'
  /** D4 — nicht vorab entschieden: der Planer im Loop wählt die Werkzeuge. */
  | 'loop'
  /** D5 — kein Werkzeug, Einzelpfad. */
  | 'prose'
  /**
   * D6 — stillgelegt: nichts erzeugt dieses Verdikt mehr.
   *
   * Kein Ort im Ablauf, sondern dessen Abwesenheit. Der Enum-Wert bleibt, weil
   * `searchIntentSchema` ein Wire-Vertrag ist (ausgelieferte Binaries lesen ihn)
   * und diese Karte total über `ChatIntentId` ist — löschen ginge nur, wenn der
   * Enum-Wert zuerst ginge, und der kann nicht. Siehe `availability: 'retired'`
   * im Intent-Registry.
   */
  | 'retired';

export const DISPOSITION_BY_INTENT: Record<ChatIntentId, Disposition> = {
  // ── D4 loop — Recherche-Familie. Der Planer entscheidet die Werkzeuge neu;
  // die Feinunterscheidung hier ist genau die Arbeit, die der Umbau streicht.
  research: 'loop',
  compare: 'loop',
  search: 'loop',
  web: 'loop',
  examples: 'loop',
  abgeordnetenwatch: 'loop',
  bundestag: 'loop',
  // ── D6 retired — als verwaltete Connectoren aus der Intent-Achse ausgezogen.
  // Sie standen hier als `loop` mit der Begründung, der Auflöser wähle nur die
  // Quelle und der Turn gehe ohnehin an den Planer. Genau das war das Argument,
  // sie ganz aus der Achse zu nehmen: die Quellenwahl ist Montage, und Montage
  // braucht kein Verdikt. `managedSourceTrigger` benennt sie jetzt direkt.
  bahn: 'retired',
  reise: 'retired',
  hotel: 'retired',
  wetter: 'retired',
  news: 'retired',
  // Stillgelegt auf demselben Weg, aber aus dem anderen Grund: `umfragen` ist
  // kein Connector geworden, sondern schlicht ein LOOP-WERKZEUG. Der Intent trug
  // zuletzt nur noch die Erwähnung, und die zurrt heute das Werkzeug direkt fest
  // (`IntentMention.pinsTool`). Zensus 0/167 vor der Stilllegung.
  umfragen: 'retired',
  // Und derselbe Weg noch einmal, mit einem zweiten Halt: `@pressemitteilungen`
  // zurrt nicht nur das PM-Beispiel-WERKZEUG fest, sondern lädt auch das REZEPT
  // `presse` (`IntentMention.activatesSkill`). Genau die Zweiteilung war der
  // Grund, warum der Intent nichts mehr trug: das Werkzeug hing im Katalog, die
  // Textsorte im Rezept, und übrig blieb `kinds.push('press')` plus eine Karte.
  pressemitteilung_examples: 'retired',
  // Und ein drittes Mal, diesmal ganz ohne Werkzeug: `social_post` war als
  // `artifact` geführt, weil es eine Karte erzeugte und eine Generierung
  // kostete. Beides beschrieb die Verpackung, nicht die Frage — die Frage war
  // „nach welcher Textsorte wird hier geschrieben", und die beantwortet ein
  // Rezept auf dem Einzeldurchlauf. Kein Verdikt nötig, kein Urteil VOR der
  // Antwort. Zensus 3/167 vor der Stilllegung.
  social_post: 'retired',
  // Und ein viertes Mal, wieder als Loop-Werkzeug: `create_recurring_task`
  // trug einen Einzeldurchlauf mit eigenem Extraktions-LLM-Aufruf und schrieb
  // OHNE Bestätigung. Jetzt liefert Tier 3.4 `agentic` mit dem Pin auf
  // `recurring_tasks`, der Loop-Planer füllt das Contract-Schema selbst, und das
  // Anlegen ist eine Karte. Zensus 0/205 vor der Stilllegung.
  create_recurring_task: 'retired',
  /** Der Auffangwert selbst. Seit #2269 der Residualwert der LLM-Stufe. */
  agentic: 'loop',

  // ── D2 artifact — jede dieser Entscheidungen kostet Geld oder einen
  // HITL-Vertrag und kann deshalb nicht dem Planer überlassen werden.
  image: 'artifact',
  image_edit: 'artifact',
  sharepic: 'artifact',
  chart: 'artifact',
  artifact: 'artifact',
  save_as_doc: 'artifact',
  create_sheet: 'artifact',
  create_presentation: 'artifact',
  create_pdf: 'artifact',

  // ── D1 anchor — an eine offene Fläche oder @-Erwähnung gebunden.
  modify_doc: 'anchor',
  edit_current_doc: 'anchor',
  edit_current_board: 'anchor',
  modify_board: 'anchor',
  edit_sheet: 'anchor',

  // ── D3 gated — eigenes Gitter, eigene Ausführung. Laufen teils IM Loop
  // (hilfe/summary/mcp), aber ihr Verdikt steuert, was dort montiert wird.
  scrape_url: 'gated',
  share_doc: 'gated',
  chat_history: 'gated',
  hilfe: 'gated',
  summary: 'gated',
  compute: 'gated',
  mcp: 'gated',

  // ── D5 prose — kein Werkzeug. Seit #2269 drei benannte Rollen statt einer.
  produktion: 'prose',
  greeting: 'prose',
  /** Legacy-Residual (F0): wird noch gelesen, als Verdikt abgelöst. */
  direct: 'prose',
};

/** Reihenfolge für Berichte — von „muss vorab entschieden werden" zu „nicht". */
export const DISPOSITION_ORDER: readonly Disposition[] = [
  'anchor',
  'artifact',
  'gated',
  'loop',
  'prose',
];

export function dispositionOf(intent: string): Disposition | null {
  return DISPOSITION_BY_INTENT[intent as ChatIntentId] ?? null;
}

/**
 * Alle Intents einer Disposition, als Set.
 *
 * Der Grund, warum die Karte hier und nicht in `apps/api` liegt: mehrere
 * handgepflegte Mengen beschreiben dieselbe Partition und driften auseinander,
 * weil sie sie je neu aufschreiben. Wer eine davon braucht, leitet sie ab.
 */
export function intentsWithDisposition(disposition: Disposition): ReadonlySet<ChatIntentId> {
  return new Set(
    (Object.keys(DISPOSITION_BY_INTENT) as ChatIntentId[]).filter(
      (id) => DISPOSITION_BY_INTENT[id] === disposition
    )
  );
}

/**
 * Prosa-Verdikte, die etwas aus dem Thread ERBEN können — `prose` ohne
 * `greeting`.
 *
 * Diese Menge stand als Literal `new Set(['produktion', 'direct'])` an drei
 * Stellen unter drei Namen: `NO_TOOL_VERDICTS` (agenticLoop/routing.ts, welche
 * Verdikte die Loop-Rettungen anfassen dürfen), `CITATION_GATED_INTENTS`
 * (respondNode, wer Zitate zeigen darf) und `CARRY_ELIGIBLE_INTENTS`
 * (intentExecutionService, wer frühere Recherche erbt). Drei Fragen, dieselbe
 * Antwort — und jede Stelle erklärte den Ausschluss von `greeting` neu.
 *
 * Der Ausschluss ist der eigentliche Inhalt und deshalb hier begründet, nicht
 * dreimal: Ein Gruss hat nichts zu erden. Er trägt seit #2269 einen eigenen
 * Intent, damit ihn keine Formulierung mehr in den Loop, in eine Zitatliste
 * oder an einen übernommenen Quellenblock ziehen kann. `prose` allein wäre
 * also die falsche Ableitung — sie nähme genau die Garantie zurück, für die
 * `greeting` abgespalten wurde.
 *
 * Nicht als vierte Disposition modelliert: eine Disposition beantwortet „was
 * muss vor der Antwort feststehen?", und darauf geben `greeting` und
 * `produktion` dieselbe Antwort (nichts). Erbfähigkeit ist eine zweite Frage an
 * dieselbe Gruppe — also eine Ableitung, keine Partition.
 */
export const GROUNDABLE_PROSE_INTENTS: ReadonlySet<ChatIntentId> = new Set(
  [...intentsWithDisposition('prose')].filter((id) => id !== 'greeting')
);

/**
 * Membership-Test für {@link GROUNDABLE_PROSE_INTENTS}, der auch ein
 * unverengtes `string` annimmt.
 *
 * Existiert, damit die Verbreiterung an EINER Stelle steht statt an jeder
 * Aufrufstelle: die drei Konsumenten bekommen ihren Intent aus Zuständen, die
 * ihn teils als `string` führen, und `Set<ChatIntentId>.has(string)` ist ein
 * Typfehler. Ein `as ChatIntentId` je Aufrufstelle wäre dreimal dieselbe
 * Zusicherung — also genau die Streuung, die diese Datei abschafft. Ein
 * Nicht-Mitglied liefert `false`, der Cast kann zur Laufzeit nichts verletzen.
 */
export function isGroundableProse(intent: string): boolean {
  return GROUNDABLE_PROSE_INTENTS.has(intent as ChatIntentId);
}
