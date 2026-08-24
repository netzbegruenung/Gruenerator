/**
 * Eine Frage, ein Ort: Ist in diesem Turn ein AUSFÜLLBARES PDF-Formular
 * erreichbar?
 *
 * Zwei Entscheidungen hängen daran, und beide hatten bis zum 24.08.2026 ihre
 * eigene Kopie des Prädikats:
 *  - ob `read_pdf_form`/`fill_pdf_form` montiert werden (`toolCatalog`),
 *  - ob eine Ausfüll-Bitte den Turn in den agentischen Loop schiebt
 *    (`routingStage` → `isPdfFillRequest` → `decideRunAgentic`).
 *
 * Beide prüften nur `mimeType === 'application/pdf'` und lagen damit falsch,
 * denn die Frage ist beim Upload längst beantwortet: `isFillablePdf`
 * (attachmentProcessingService) entscheidet sie, und nur ein Formular bekommt
 * seine Bytes als `file_data`. `getThreadPdfFiles` filtert auf genau diese
 * Spalte — ein PDF ohne Bytes ist eines, von dem feststand, dass es keines ist.
 *
 * Die Folgen unterschieden sich in der Schwere, nicht in der Ursache: die
 * Montage bot zwei Werkzeuge an, die nicht gelingen KONNTEN (live rief der
 * Planer `read_pdf_form` auf eine Datenschutzerklärung), das Routing schob nur
 * unnötig in den Loop. Deshalb steht das Prädikat jetzt hier und nicht zweimal.
 *
 * `pdfFormAttachments` trägt die Bytes dieses Turns selbst und ist damit für
 * sich schon der Beweis — es wird nur für Formulare gefüllt und existiert,
 * weil `threadAttachments` erst nach dem Turn geschrieben wird.
 */
import { type ThreadAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

export function hasReachableForm(state: {
  pdfFormAttachments?: Array<{ name: string; data: string }> | undefined;
  threadAttachments?: ThreadAttachment[] | undefined;
}): boolean {
  if ((state.pdfFormAttachments?.length ?? 0) > 0) return true;
  return (state.threadAttachments ?? []).some(
    (a) => a.mimeType === 'application/pdf' && a.hasFileData
  );
}
