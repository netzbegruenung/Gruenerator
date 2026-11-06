/**
 * Ganzdokument-Aufgaben: ein Turn, der das GANZE Material braucht, liest es ganz.
 *
 * Eine Zusammenfassung ist keine Frage AN ein Dokument, sondern Arbeit am
 * Ganzen. Bis zum 06.11.2026 bekam sie trotzdem nur, was die Ablage für Fragen
 * vorsieht: über 12.000 Zeichen wird ein Anhang vektorisiert und kommt per
 * Passagensuche zurück (6.000 Zeichen im Loop), darunter kappt
 * `limitAttachmentContext` jedes Dokument bei 25.000 Zeichen, und
 * `summarizeNode` setzte den Volltext aus höchstens 20 Qdrant-Chunks zusammen.
 * Live 06.11.2026 (Thread f421f2a5): ein 30-seitiges PDF kam mit 23.158 Zeichen
 * an, die Map-Reduce-Zusammenfassung brauchte 41 s und wurde als Werkzeug nach
 * 20 s verworfen, und der eingefügte Text desselben Turns verlor gegen das
 * ältere PDF.
 *
 * Hier fällt die eine Entscheidung: WELCHES Material ganz gelesen wird (das
 * dieses Turns, sonst das des Gesprächs) und OB es ins Budget passt. Passt es,
 * steht der Volltext im Prompt und der Schreiber fasst selbst zusammen — in der
 * Form, die die Person verlangt hat, ohne Werkzeug und ohne Werkzeugfrist.
 * Passt es nicht, bleibt `summarize` (Map-Reduce) zuständig.
 *
 * Der Volltext liegt immer schon vor: für die Anhänge dieses Turns aus der
 * Extraktion, für frühere aus `chat_thread_attachments.extracted_text` — auch
 * bei vektorisierten Zeilen. Gelesen wird also nichts nach, es wird nur nicht
 * mehr weggelassen.
 */
import { isSummaryAsk } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';

import { CHARS_PER_TOKEN } from './messageHelpers.js';

import type {
  ThreadAttachment,
  WholeDocumentTurn,
} from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * Anteil des Fensters, den ganze Dokumente belegen dürfen. Das Dreifache des
 * Abruf-Anteils (`RETRIEVAL_WINDOW_SHARE`, 15 %), weil hier das Dokument der
 * Auftrag ist und nicht ein Beleg unter vielen; die andere Hälfte trägt
 * Systemprompt, Verlauf und Antwort. Beim konservativen Standardfenster
 * (86.600 Tokens) sind das rund 150.000 Zeichen — 50 bis 60 Seiten Fließtext.
 */
export const WHOLE_DOCUMENT_WINDOW_SHARE = 0.5;

/** Untergrenze, auch ohne bekanntes Fenster: 40.000 Zeichen ≈ 11k Tokens. */
export const WHOLE_DOCUMENT_FLOOR_CHARS = 40_000;

/**
 * Über dieser Länge IST die Nachricht das Material („Fasse zusammen: <Text>").
 * Dieselbe Schwelle wie `LONG_PASTE_THRESHOLD` in summarizeNode.
 */
const MESSAGE_IS_MATERIAL_CHARS = 500;

export function wholeDocumentBudgetChars(contextWindowTokens: number | undefined): number {
  if (!contextWindowTokens) return WHOLE_DOCUMENT_FLOOR_CHARS;
  return Math.max(
    WHOLE_DOCUMENT_FLOOR_CHARS,
    Math.floor(contextWindowTokens * WHOLE_DOCUMENT_WINDOW_SHARE * CHARS_PER_TOKEN)
  );
}

export function resolveWholeDocumentTurn(input: {
  userText: string;
  /** Die Dokument-Anhänge dieses Turns mit ihrem extrahierten Text. */
  turnDocs: readonly { name: string; text: string; documentId?: string | null }[];
  threadAttachments: readonly ThreadAttachment[];
  /** Der Turn nennt anderes Material (@datei, Notebook, @dokumentchat) — dann
   *  meint „fasse zusammen" das, nicht die früheren Anhänge. */
  turnReferencesOtherMaterial: boolean;
  contextWindowTokens: number | undefined;
}): WholeDocumentTurn | null {
  if (!isSummaryAsk(input.userText)) return null;

  const turnDocs = input.turnDocs.filter((d) => d.text.trim().length > 0);
  let origin: WholeDocumentTurn['origin'];
  let docs: WholeDocumentTurn['docs'];
  if (turnDocs.length > 0) {
    origin = 'turn';
    docs = turnDocs.map((d) => ({ name: d.name, text: d.text, documentId: d.documentId ?? null }));
  } else {
    if (input.turnReferencesOtherMaterial) return null;
    if (input.userText.trim().length > MESSAGE_IS_MATERIAL_CHARS) return null;
    const earlier = input.threadAttachments.filter(
      (a) => !a.isImage && (a.extractedText?.trim().length ?? 0) > 0
    );
    if (earlier.length === 0) return null;
    origin = 'thread';
    docs = earlier.map((a) => ({
      name: a.name,
      text: a.extractedText ?? '',
      documentId: a.documentId,
    }));
  }

  const chars = docs.reduce((sum, d) => sum + d.text.length, 0);
  const budgetChars = wholeDocumentBudgetChars(input.contextWindowTokens);
  return { origin, docs, chars, budgetChars, fits: chars <= budgetChars };
}

/**
 * Die Qdrant-Ids, deren Volltext in diesem Turn im Prompt steht. Leer, wenn
 * nichts passt: dann steht auch nichts im Prompt, und Suche wie Map-Reduce
 * bleiben die Wege zum Inhalt.
 */
export function wholeDocumentIdsInPrompt(
  turn: WholeDocumentTurn | null | undefined
): ReadonlySet<string> {
  if (!turn?.fits) return new Set();
  return new Set(turn.docs.map((d) => d.documentId).filter((id): id is string => id != null));
}

/**
 * Die Qdrant-Ids, die ein Ganzdokument-Turn NICHT über die Suche braucht: die
 * Dokumente, die er ganz liest, und bei Material dieses Turns auch die
 * mitgeführten früheren Anhänge — gefragt ist nach dem neuen. Gilt für
 * `summarize` immer (es liest `docs` direkt, auch wenn sie nicht passen; der
 * Live-Test vom 06.11.2026 fasste dasselbe 233k-Dokument sonst zweimal
 * zusammen, einmal aus dem Volltext, einmal aus 20 Qdrant-Chunks).
 */
export function wholeDocumentReadDirectly(
  turn: WholeDocumentTurn | null | undefined,
  threadAttachments: readonly ThreadAttachment[]
): ReadonlySet<string> {
  if (!turn) return new Set();
  const ids = new Set(turn.docs.map((d) => d.documentId).filter((id): id is string => id != null));
  if (turn.origin === 'turn') {
    for (const a of threadAttachments) if (a.documentId) ids.add(a.documentId);
  }
  return ids;
}

/**
 * Was der Loop nicht als Passagen vorab holt und wofür er kein Lesewerkzeug
 * erzwingt: dasselbe wie oben, aber nur, wenn der Text passt — dann steht er
 * ganz im Prompt. Live 06.11.2026 lagen neben der eingefügten Seite 6.000
 * Zeichen Passagen aus dem alten PDF als Quellen im Prompt. Passt er nicht,
 * bleiben Suche und `summarize` die Wege zum Inhalt.
 */
export function wholeDocumentSkipsRetrieval(
  turn: WholeDocumentTurn | null | undefined,
  threadAttachments: readonly ThreadAttachment[]
): ReadonlySet<string> {
  return turn?.fits ? wholeDocumentReadDirectly(turn, threadAttachments) : new Set();
}

/**
 * Unter dieser Länge liest der Planer das Material mit, wie bisher: der
 * Vorlauf kostet dort wenig, und kleine Anhänge sind ohnehin nicht vektorisiert
 * (`SMALL_DOC_VECTORIZATION_THRESHOLD`, contextEnrichmentService), also auch
 * nicht über `dokumente_lesen` nachlesbar.
 */
const PLANNER_STUB_MIN_CHARS = 12_000;

/**
 * Was der PLANER im split-Modus an Stelle des Volltexts sieht. Der Schreiber
 * bekommt das Dokument ganz; der Planer entscheidet nur über Werkzeuge und
 * braucht den Text dafür fast nie. Live-Test 06.11.2026: Gemma las 79.313
 * Zeichen Systemprompt 36 s lang ein und rief dann nichts auf — die erste
 * Antwortzeile kam nach 58 s (#5399).
 *
 * Nur, wenn JEDES Dokument über `dokumente_lesen` nachlesbar ist (vektorisiert
 * und an diesen Turn gebunden, `readableIds`): sonst nähme der Platzhalter dem
 * Planer Inhalt, an den er nicht mehr herankäme. Die Blockart folgt dem
 * Ursprung, weil respondNode Material dieses Turns unter `anhang` und
 * früheres unter `frueheres_dokument` einbettet.
 */
export function plannerDocumentStub(
  turn: WholeDocumentTurn | null | undefined,
  readableIds: ReadonlySet<string>
): { kind: 'anhang' | 'frueheres_dokument'; text: string } | null {
  if (!turn?.fits || turn.chars < PLANNER_STUB_MIN_CHARS) return null;
  if (!turn.docs.every((d) => d.documentId != null && readableIds.has(d.documentId))) return null;
  const list = turn.docs
    .map((d) => `- „${d.name}" (${d.text.length.toLocaleString('de-DE')} Zeichen)`)
    .join('\n');
  return {
    kind: turn.origin === 'turn' ? 'anhang' : 'frueheres_dokument',
    text: `[Für die Werkzeugplanung gekürzt] Diese Dokumente liegen dem Schreiber der Antwort im VOLLTEXT vor:
${list}
Du musst sie weder lesen noch zusammenfassen — der Schreiber arbeitet direkt damit. Brauchst du für einen Werkzeugaufruf konkreten Inhalt daraus (ein Thema, Zahlen, ein Zitat), hol ihn gezielt mit \`dokumente_lesen\`.`,
  };
}
