/**
 * Was dieses Gespräch bereits gebaut hat — als EINE Liste, für alle, die sie
 * brauchen.
 *
 * Der Anlass: ein Bild stand sichtbar im Chat, und die Antwort darunter lautete
 * „Die Bildgenerierung ist leider fehlgeschlagen." Einen Turn später: „Da ich
 * bisher kein Bild generiert habe …". Beides war korrekt gelesen — das Artefakt
 * lebt in `metadata` (Render-Kanal), das Modell liest `parts` (Modell-Kanal),
 * und `convertToModelMessages` trägt Metadaten nie hinüber. Für den Schreiber
 * hatte das Bild nie existiert.
 *
 * Das Vorbild ist der Quellen-Pfad: `getRecentThreadSources` → `sourceRegistry`
 * löst dasselbe Problem („Material aus einem früheren Turn muss das Modell
 * erreichen") mit Ordnung, Dedup, Deckel und einer Zeitform. Die Artefakt-Hälfte
 * derselben Abfrage existiert bereits — `listThreadArtifacts` steht in derselben
 * Datei, liest dieselbe Spalte, dedupt über denselben Schlüssel. Sie hörte nur
 * eine Etage früher auf: beim Routing, statt beim Modell.
 *
 * Bewusst KEINE `[A1]`-Marker im Schreiber-Block. Ein Griff nützt nur dem, der
 * ihn zurückgibt, und das ist allein der Auflöser (`resolveEditTarget`) — der
 * bekommt seine nummerierte Sicht aus derselben Funktion. Dem schreibenden
 * Modell einen Marker hinzulegen, den es nicht ausgeben soll, hiesse einen
 * zweiten Fehler gegen den ersten zu tauschen: `[A1]` in der Nutzerantwort.
 */

import type { ChatGraphState, ThreadToolContext } from '../types.js';

/** Deutsche Artefakt-Nomen für jede Prompt-Liste. Total, damit eine neue
 *  `ThreadToolContext`-Art ein Compile-Fehler ist und kein Loch. */
export const ARTIFACT_NOUN: Record<ThreadToolContext['kind'], string> = {
  image: 'Bild',
  sharepic: 'Sharepic',
  document: 'Dokument',
  presentation: 'Präsentation',
  sheet: 'Tabelle',
  pdf: 'PDF',
  board: 'Board',
  mcp: 'Dienst-Abfrage',
  notebook: 'Notebook-Recherche',
  bundestag: 'Bundestag-Recherche',
  abgeordnetenwatch: 'Abgeordnetenwatch-Recherche',
};

/**
 * Nur die Arten, die als „das habe ich gebaut" im Chat stehen. Die
 * Recherche-Arten (`mcp`, `notebook`, `bundestag`, `abgeordnetenwatch`) sind
 * Werkzeug-Spuren, keine Artefakte — sie gehören in den Quellen-Block, und sie
 * hier zu nennen hiesse dem Modell zu sagen, eine Abfrage sei ein Gegenstand,
 * den man bearbeiten kann.
 */
const EDITABLE_KINDS: ReadonlySet<ThreadToolContext['kind']> = new Set([
  'image',
  'sharepic',
  'document',
  'presentation',
  'sheet',
  'pdf',
  'board',
]);

export interface InventoryEntry {
  artifact: ThreadToolContext;
  /** Aus einem FRÜHEREN Turn. Die einzige Unterscheidung, die der Block trägt —
   *  und die ganze Aussage: „ist noch da" gegen „ist gerade entstanden". */
  prior: boolean;
}

/** Zwei Turns am selben Dokument sind ein Artefakt. Ein Sharepic führt keine
 *  stabile Id über Turns, also dedupt seine Art allein — genau wie in
 *  `listThreadArtifacts`, wo diese Regel herkommt. */
function keyOf(a: ThreadToolContext): string {
  return `${a.kind}:${a.ref ?? ''}`;
}

/** Kurze, einzeilige Beschriftung. Ein Prompt-Block verträgt keinen Absatz. */
function labelOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 60) : null;
}

/**
 * Was DIESER Turn gebaut hat, aus dem laufenden State.
 *
 * Spiegelt `deriveToolContext` (postResponseService) samt Vorrang — ein Turn,
 * der recherchiert UND eine Tabelle gebaut hat, ist ein Tabellen-Turn. Anders
 * als dort werden `ref`/`label` mitgeführt: die persistierte Fassung wirft sie
 * für Bild und Sharepic weg, und beim Wiedereinlesen holt
 * `artifactFromMessageMetadata` sie ohnehin aus denselben Feldern zurück.
 */
export function artifactsFromTurn(state: ChatGraphState): ThreadToolContext[] {
  const out: ThreadToolContext[] = [];
  const image = state.generatedImage;
  if (image?.url) {
    out.push({ kind: 'image', ref: image.url, label: labelOf(state.imagePrompt ?? image.prompt) });
  }
  if ((state.sharepicVariants?.length ?? 0) > 0) {
    out.push({ kind: 'sharepic', ref: null, label: null });
  }
  const doc = state.createdDocument;
  if (doc?.documentId) {
    const sub = doc.subtype ?? '';
    const kind = sub.startsWith('presentation')
      ? 'presentation'
      : sub.startsWith('sheet')
        ? 'sheet'
        : sub.startsWith('pdf')
          ? 'pdf'
          : 'document';
    out.push({ kind, ref: doc.documentId, label: labelOf(doc.title) });
  }
  // Boards persistieren heute keine Metadaten (`artifactKinds.ts`, BOARD_SPEC),
  // erreichen den nächsten Turn also nie. Im LAUFENDEN Turn sind sie da, und
  // genau dort trat der Fehlschlag-Satz auf — deshalb hier, obwohl die
  // Prior-Hälfte fehlt.
  if (state.createdBoard) {
    out.push({
      kind: 'board',
      ref: state.createdBoard.boardId,
      label: labelOf(state.createdBoard.title),
    });
  }
  return out;
}

/**
 * Die Ids, die es wirklich gibt — Erlaubnisliste für den Ausgabe-Filter
 * (`stripFabricatedArtifactDelivery`). Dieser Turn und die früheren zusammen:
 * ein Pfad, den der Code dem Modell selbst genannt hat (`/boards/<id>` aus dem
 * agentischen Loop), muss die Antwort überleben — ein erfundener nicht.
 */
export function knownArtifactRefs(state: ChatGraphState): string[] {
  return [...artifactsFromTurn(state), ...(state.threadArtifacts ?? [])]
    .map((a) => a.ref)
    .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
}

/**
 * Die Liste, gegen die alles andere spricht.
 *
 * Reihenfolge ist neueste-zuerst: erst was dieser Turn gebaut hat, dann die
 * früheren in der Ordnung, in der `listThreadArtifacts` sie liefert. Position
 * IST die Nummer, die der Auflöser sieht — deshalb steht die Ordnung hier und
 * nicht bei den Aufrufern, und deshalb kann keine Aufrufreihenfolge sie
 * verschieben.
 *
 * Ein Artefakt, das dieser Turn angefasst hat, gilt als frisch: die Zeitform
 * beschreibt den letzten Stand, nicht die Herkunft.
 */
export function buildArtifactInventory(opts: {
  prior?: readonly ThreadToolContext[] | null;
  fresh?: readonly ThreadToolContext[] | null;
}): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  const seen = new Set<string>();
  for (const artifact of opts.fresh ?? []) {
    if (!EDITABLE_KINDS.has(artifact.kind)) continue;
    const key = keyOf(artifact);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ artifact, prior: false });
  }
  for (const artifact of opts.prior ?? []) {
    if (!EDITABLE_KINDS.has(artifact.kind)) continue;
    const key = keyOf(artifact);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ artifact, prior: true });
  }
  return entries;
}

function describe(entry: InventoryEntry): string {
  const noun = ARTIFACT_NOUN[entry.artifact.kind];
  const label = entry.artifact.label ? ` „${entry.artifact.label}"` : '';
  return `- ${noun}${label} — ${entry.prior ? 'früher in diesem Gespräch erstellt' : 'in diesem Turn erstellt'}`;
}

/**
 * Der Block für das schreibende Modell.
 *
 * Das Verbot ist der Zweck des Blocks, nicht seine Verzierung: die Liste allein
 * hat den Fehlschlag-Satz nicht verhindert, weil daneben eine fertige
 * Formulierung fürs Gegenteil stand. Ein Ausgang, den der Code bereits kennt,
 * darf nicht als Wahlmöglichkeit im Prompt liegen.
 */
/**
 * Das Modell kennt die Adresse eines Artefakts nicht — und kann sie nicht
 * kennen: die Karte im Chat trägt einen RELATIVEN Pfad (`/office/<id>`), der
 * gegen die Umgebung aufgelöst wird, aus der die Anfrage kam (Beta, Desktop-App,
 * Produktion). Schreibt das Modell trotzdem eine Adresse, rät es die Domain —
 * live am 02.08.2026 „https://www.gruenerator.eu/office/…" aus einer
 * Beta-Sitzung, also ein 404 direkt unter der Karte, die funktioniert hätte.
 *
 * Deshalb ein Verbot und keine Vorlage: es gibt keine richtige Domain, die man
 * dem Modell mitgeben könnte, ohne sie in der nächsten Umgebung wieder falsch
 * zu machen.
 */
export const NO_ARTIFACT_URL_RULE =
  'Schreibe NIEMALS eine Internetadresse (http…, www…, Domain) zu einem Artefakt in deine Antwort — die Karte im Chat öffnet es selbst, jede ausgeschriebene Adresse wäre geraten und führte ins Leere. Nenne höchstens den Pfad, den dir der Code ausdrücklich genannt hat, und stelle ihm nichts voran.';

export function renderArtifactInventory(entries: readonly InventoryEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map(describe).join('\n');
  return `\n\n## ARTEFAKTE IN DIESEM GESPRÄCH\n\n${lines}\n\nDiese Artefakte sind fertig und stehen sichtbar im Chat. Behaupte NIEMALS, eines davon existiere nicht, sei nicht erstellt worden oder seine Erstellung sei fehlgeschlagen. Wenn sich der Auftrag auf eines bezieht, meine dieses — erfinde kein zweites. ${NO_ARTIFACT_URL_RULE}`;
}

/**
 * Dieselbe Liste, 1-basiert nummeriert, für den Auflöser.
 *
 * Getrennt gerendert, weil die Zielgruppe eine andere ist: hier IST die Nummer
 * die Antwort, dort wäre sie ein Marker, den das Modell nachplappern kann.
 * Gemeinsam bleibt die Ordnung — beide sehen dieselbe Liste in derselben Folge,
 * also meint „2." in der Antwort des Auflösers denselben Gegenstand, den der
 * Schreiber an zweiter Stelle gelesen hat.
 */
export function renderArtifactChoices(artifacts: readonly ThreadToolContext[]): string {
  return artifacts
    .map(
      (a, i) => `${i + 1}. ${ARTIFACT_NOUN[a.kind] ?? a.kind}${a.label ? ` („${a.label}")` : ''}`
    )
    .join('\n');
}
