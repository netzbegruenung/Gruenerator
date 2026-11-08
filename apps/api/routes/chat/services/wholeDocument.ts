/**
 * Ganzdokument-Aufgaben: ein Turn, der das GANZE Material braucht, liest es ganz.
 *
 * Eine Zusammenfassung ist keine Frage AN ein Dokument, sondern Arbeit am
 * Ganzen. Bis zum 06.11.2026 bekam sie trotzdem nur, was die Ablage für Fragen
 * vorsieht: über 12.000 Zeichen wird ein Anhang vektorisiert und kommt per
 * Passagensuche zurück (6.000 Zeichen im Loop), darunter kappt
 * `limitMaterialTexts` jedes Dokument bei 25.000 Zeichen, und
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
 * Zweiter Auslöser: eingefügter Text (Paste-Chip). Ein Paste ist das Material
 * des Turns, kein Nachschlagewerk — „Hier sind die Termine" über einer langen
 * Liste will jeden Termin, nicht die drei, die eine Suche nach „Termine"
 * zurückbringt. Live 04.11.2026 (#5406, Thread aad8d508): über 12.000 Zeichen
 * wurde die Liste vektorisiert, der Turn zur Suche, und das Modell antwortete
 * zweimal „Du hast mir keinen Text geschickt"; auf gruenerator.eu nachgestellt
 * kamen 38 von 110 Terminen an, der Rest fehlte still. Dieser Auslöser greift
 * nur, wenn das Material des Turns AUSSCHLIESSLICH aus Pastes besteht und ganz
 * ins Budget passt: ein hochgeladenes PDF daneben bleibt bei der Suche, und ein
 * zu großer Paste fällt auf sie zurück statt auf Map-Reduce, das für
 * „formatiere" die falsche Antwort wäre.
 *
 * Der Volltext liegt immer schon vor: für die Anhänge dieses Turns aus der
 * Extraktion, für frühere aus `chat_thread_attachments.extracted_text` — auch
 * bei vektorisierten Zeilen. Gelesen wird also nichts nach, es wird nur nicht
 * mehr weggelassen.
 */
import { isSummaryAsk } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';

import { isPastedTextAttachment } from './attachmentProcessingService.js';
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

/**
 * Ein Folgeturn ohne eigenes Material liest den JÜNGSTEN Paste des Gesprächs
 * ganz, wenn er vektorisiert wurde und ins Budget passt (#5478). Ein Paste unter
 * der Vektorisierungsschwelle steht ohnehin in jedem Folgeturn ganz im Prompt;
 * darüber kam er nur noch als Passage (6.000 Zeichen) zurück. Live 08.11.2026:
 * „Gib mir alle Termine vom Team Verkehr … Keinen weglassen" über der Liste des
 * Vorturns lieferte 7 von 18 als „alle".
 *
 * Nur der jüngste, und nur wenn er der jüngste Anhang ist: ein später
 * hochgeladenes PDF meint der Turn eher als den Paste davor, und ältere Pastes
 * bleiben bei der Suche — sonst kostete jeder Paste jeden Folgeturn seine
 * volle Länge.
 */
function latestPasteOfThread(
  input: Pick<
    Parameters<typeof resolveWholeDocumentTurn>[0],
    'userText' | 'threadAttachments' | 'turnReferencesOtherMaterial'
  >,
  budgetChars: number
): WholeDocumentTurn | null {
  if (input.turnReferencesOtherMaterial) return null;
  if (input.userText.trim().length > MESSAGE_IS_MATERIAL_CHARS) return null;
  const latest = input.threadAttachments.filter((a) => !a.isImage).at(-1);
  if (!latest?.documentId || !isPastedTextAttachment(latest.name, latest.mimeType)) return null;
  const text = latest.extractedText ?? '';
  if (text.trim().length === 0 || text.length > budgetChars) return null;
  return {
    origin: 'thread',
    ask: 'paste',
    docs: [{ name: latest.name, text, documentId: latest.documentId }],
    chars: text.length,
    budgetChars,
    fits: true,
  };
}

/**
 * Ob die Dokument-Chat-Ids des Requests ANDERES Material wählen als die
 * Anhänge des Gesprächs. Der Web-Client merkt sich jede Id aus
 * `document_indexed` je Thread und schickt sie in jedem Folgeturn mit
 * (`documentChatStore`) — sein eigener Paste kam so als „gewähltes Material"
 * zurück, und kein Folgeturn las mehr ganz, auch keine Zusammenfassung (#5478).
 */
export function picksOtherDocumentChat(
  pickedIds: readonly string[],
  threadAttachmentDocIds: readonly string[]
): boolean {
  const own = new Set(threadAttachmentDocIds);
  return pickedIds.some((id) => !own.has(id));
}

export function resolveWholeDocumentTurn(input: {
  userText: string;
  /** Die Dokument-Anhänge dieses Turns mit ihrem extrahierten Text; `pasted`
   *  markiert eingefügten Text (`isPastedTextAttachment`). */
  turnDocs: readonly {
    name: string;
    text: string;
    documentId?: string | null;
    pasted?: boolean;
  }[];
  threadAttachments: readonly ThreadAttachment[];
  /** Der Turn nennt anderes Material (@datei, Notebook, @dokumentchat) — dann
   *  meint „fasse zusammen" das, nicht die früheren Anhänge. */
  turnReferencesOtherMaterial: boolean;
  contextWindowTokens: number | undefined;
}): WholeDocumentTurn | null {
  const turnDocs = input.turnDocs.filter((d) => d.text.trim().length > 0);
  const budgetChars = wholeDocumentBudgetChars(input.contextWindowTokens);

  if (!isSummaryAsk(input.userText)) {
    if (turnDocs.length === 0) return latestPasteOfThread(input, budgetChars);
    if (!turnDocs.every((d) => d.pasted === true)) return null;
    const docs = turnDocs.map((d) => ({
      name: d.name,
      text: d.text,
      documentId: d.documentId ?? null,
    }));
    const chars = docs.reduce((sum, d) => sum + d.text.length, 0);
    if (chars > budgetChars) return null;
    return { origin: 'turn', ask: 'paste', docs, chars, budgetChars, fits: true };
  }

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
  return { origin, ask: 'summary', docs, chars, budgetChars, fits: chars <= budgetChars };
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
 * Die Dokument-Chat-Ids, in denen dieser Turn noch suchen muss. Ein Paste-Turn
 * hat seinen eingefügten Text ganz im Prompt; indiziert ist er nur für die
 * Folgeturns. Zählte er trotzdem als Dokument-Chat, erzwang der Klassifikator
 * eine Suche, und der Prompt sagte „auf ausgewählte Dokumente begrenzt" — live
 * nachgestellt antwortete das Modell dann „In deiner Nachricht sind keine
 * Termine angekommen" und fragte nach dem „angehängten Dokument" (#5406).
 * Eine Zusammenfassung behält ihre Ids: ihr Suchumfang ist bewusst so gebaut.
 */
export function documentChatIdsToSearch(state: {
  documentChatIds?: readonly string[] | null | undefined;
  wholeDocument?: WholeDocumentTurn | null | undefined;
}): string[] {
  const ids = [...(state.documentChatIds ?? [])];
  if (state.wholeDocument?.ask !== 'paste') return ids;
  const inPrompt = wholeDocumentIdsInPrompt(state.wholeDocument);
  return ids.filter((id) => !inPrompt.has(id));
}

/**
 * Die Qdrant-Ids, die ein Ganzdokument-Turn NICHT über die Suche braucht: die
 * Dokumente, die er ganz liest, und bei einer Zusammenfassung von Material
 * dieses Turns auch die mitgeführten früheren Anhänge — gefragt ist nach dem
 * neuen. Ein Paste-Turn ohne Zusammenfassung lässt sie suchbar: „Vergleiche
 * das mit dem PDF von vorhin" braucht das PDF. Gilt für
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
  if (turn.origin === 'turn' && turn.ask === 'summary') {
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
