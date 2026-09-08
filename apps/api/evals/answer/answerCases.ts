/**
 * Fälle der Antwort-Eval — abgeleitet aus `evals/retrieval/cases.ts`, nicht
 * kopiert.
 *
 * Die Retrieval-Eval bewertet den RANG eines Dokuments. Diese hier bewertet die
 * ANTWORT, die aus denselben Dokumenten entsteht. Damit ein Unterschied
 * zwischen beiden Messungen eine Aussage über den Antwortpfad ist und nicht
 * über eine andere Fragenmenge, stammt jede Frage hier aus einer schon
 * kalibrierten Quelle:
 *
 *  1. die 9 `kind: 'notebook'`-Fälle mit ihrem `notebook`-Umfang unverändert
 *     (`collectionId` / `collectionIds` / `user`-Attrappe), genau wie
 *     `runNotebookCase` in `runRetrievalEval.ts` sie auflöst;
 *  2. 20 `qa`-Fälle, deren `collection` zur Notebook-Sammlung wird — derselbe
 *     Rückfall, den `EVAL_PIPELINE=notebook EVAL_CASE_KIND=qa` fährt
 *     (`runRetrievalEval.ts:438`);
 *  3. die 5 `near-topic`-Fragen aus `evals/retrieval/evidenceSignalCheck.ts`
 *     (`NEAR_TOPIC_CASES`, dort nicht exportiert), wortgleich übernommen.
 *     Bei ihnen ist die richtige Antwort „dazu steht im Notebook wenig" — sie
 *     werden im Bericht getrennt ausgewiesen und gehen in keine Gewinnrate ein.
 *
 * ── Warum die 20 so und nicht anders gewählt sind ──────────────────────────
 * Der Auftrag nannte „die 20 kw-Fälle". Ein solches Präfix gibt es in
 * `cases.ts` nicht (83 Fälle: 52 `qa`, 12 `manual`, 9 `notebook`,
 * 10 `chat-notebook`), und keine Teilmenge hat von sich aus die Grösse 20. Der
 * Klammerzusatz des Auftrags benennt aber eindeutig den Mechanismus —
 * `EVAL_CASE_KIND=qa` —, also sind es `qa`-Fälle. Aus 52 werden 20 über ein
 * Reihum-Verfahren in Dateireihenfolge (`selectQaCases`): jede der neun
 * Sammlungen kommt mindestens zweimal vor, keine Sammlung dominiert. Das ist
 * eine Setzung, keine Ableitung aus den Daten — aber eine reproduzierbare:
 * dieselbe `cases.ts` ergibt dieselben 20.
 */
import { RETRIEVAL_CASES } from '../retrieval/cases.js';
import { type NotebookCaseMeta, type RetrievalCase } from '../retrieval/cases.js';

/**
 * `notebook` und `qa` gehen in die Gewinnraten ein, `near-topic` nicht — dort
 * ist die gewünschte Antwort eine Absage, und ein Richter, der Ausführlichkeit
 * belohnt, würde die Zahl in die falsche Richtung ziehen.
 */
export type AnswerCaseGroup = 'notebook' | 'qa' | 'near-topic';

export interface AnswerCase {
  id: string;
  group: AnswerCaseGroup;
  question: string;
  /** Nur Berichtsetikett. Der Suchumfang steht in `notebook`. */
  collection: string;
  notebook: NotebookCaseMeta;
}

/** Wie viele `qa`-Fälle die Fallmenge trägt (siehe Kopfkommentar). */
export const QA_CASE_TARGET = 20;

/**
 * Reihum über die Sammlungen, in Dateireihenfolge.
 *
 * `Map` bewahrt die Einfügereihenfolge, also die Reihenfolge des ersten
 * Auftretens einer Sammlung in `cases.ts` — der Lauf ist damit stabil, solange
 * die Datei stabil ist. Ein neuer `qa`-Fall am Ende einer schon vertretenen
 * Sammlung ändert die Auswahl nicht; eine neue Sammlung schon, und das ist
 * gewollt: sie soll dann auch gemessen werden.
 */
export function selectQaCases(
  all: readonly RetrievalCase[],
  target: number = QA_CASE_TARGET
): RetrievalCase[] {
  const byCollection = new Map<string, RetrievalCase[]>();
  for (const c of all) {
    if (c.kind != null && c.kind !== 'qa') continue;
    const list = byCollection.get(c.collection) ?? [];
    list.push(c);
    byCollection.set(c.collection, list);
  }

  const picked: RetrievalCase[] = [];
  for (let round = 0; picked.length < target; round++) {
    let progressed = false;
    for (const list of byCollection.values()) {
      const c = list[round];
      if (!c) continue;
      progressed = true;
      picked.push(c);
      if (picked.length === target) break;
    }
    if (!progressed) break;
  }
  return picked;
}

const NOTEBOOK_CASES: AnswerCase[] = RETRIEVAL_CASES.filter(
  (c): c is RetrievalCase & { notebook: NotebookCaseMeta } =>
    c.kind === 'notebook' && c.notebook != null
).map((c) => ({
  id: c.id,
  group: 'notebook',
  question: c.query,
  collection: c.collection,
  notebook: c.notebook,
}));

const QA_CASES: AnswerCase[] = selectQaCases(RETRIEVAL_CASES).map((c) => ({
  id: c.id,
  group: 'qa',
  question: c.query,
  collection: c.collection,
  // Der Rückfall aus `runNotebookCase`: ein Fall ohne `notebook`-Metadaten
  // trägt seine System-Sammlungs-ID im `collection`-Feld.
  notebook: { collectionId: c.collection },
}));

/**
 * Wortgleich aus `evidenceSignalCheck.ts:218-249`. Kopiert statt importiert,
 * weil `NEAR_TOPIC_CASES` dort nicht exportiert ist und das Modul beim Import
 * die halbe Suchmaschine hochfährt — ein Fallverzeichnis darf das nicht.
 */
const NEAR_TOPIC_CASES: AnswerCase[] = [
  {
    id: 'neartopic-bvg-monatsabo',
    group: 'near-topic',
    question: 'Was kostet ein BVG-Monatsabo?',
    collection: 'berlin-system',
    notebook: { collectionId: 'berlin-system' },
  },
  {
    id: 'neartopic-abgeordnetenhauswahl',
    group: 'near-topic',
    question: 'Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?',
    collection: 'berlin-system',
    notebook: { collectionId: 'berlin-system' },
  },
  {
    id: 'neartopic-muenchen-einwohner',
    group: 'near-topic',
    question: 'Wie viele Einwohner hat München?',
    collection: 'bayern-system',
    notebook: { collectionId: 'bayern-system' },
  },
  {
    id: 'neartopic-landesvorsitz-bayern',
    group: 'near-topic',
    question: 'Wer hat den Landesvorsitz der bayerischen Grünen?',
    collection: 'bayern-system',
    notebook: { collectionId: 'bayern-system' },
  },
  {
    id: 'neartopic-moor-foerdersumme',
    group: 'near-topic',
    question: 'Wie hoch war die Fördersumme für Moorrenaturierung 2024?',
    collection: 'bayern-system',
    notebook: { collectionId: 'bayern-system' },
  },
];

export const ANSWER_CASES: AnswerCase[] = [...NOTEBOOK_CASES, ...QA_CASES, ...NEAR_TOPIC_CASES];

/** Ein Fall ohne auflösbaren Umfang wäre ein stiller Nulllauf. */
export function hasScope(c: AnswerCase): boolean {
  const { collectionId, collectionIds, user } = c.notebook;
  return (
    (typeof collectionId === 'string' && collectionId.length > 0) ||
    (Array.isArray(collectionIds) && collectionIds.length > 0) ||
    (user != null && user.documentIds.length > 0)
  );
}
