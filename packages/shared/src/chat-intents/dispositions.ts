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
 * `share_doc` und `create_recurring_task` (beide gated), `category: 'internal'`
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
  pressemitteilung_examples: 'loop',
  abgeordnetenwatch: 'loop',
  bundestag: 'loop',
  umfragen: 'loop',
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
  /** Der Auffangwert selbst. Seit #2269 der Residualwert der LLM-Stufe. */
  agentic: 'loop',

  // ── D2 artifact — jede dieser Entscheidungen kostet Geld oder einen
  // HITL-Vertrag und kann deshalb nicht dem Planer überlassen werden.
  image: 'artifact',
  image_edit: 'artifact',
  sharepic: 'artifact',
  social_post: 'artifact',
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
  create_recurring_task: 'gated',
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
