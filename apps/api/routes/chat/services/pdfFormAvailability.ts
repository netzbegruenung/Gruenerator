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
 * GELTUNGSBEREICH — beide Hälften tragen dasselbe Urteil, auf zwei Wegen:
 *
 *  - `threadAttachments` (frühere Turns): `hasFileData` ist das Urteil von
 *    `isFillablePdf`, nachgelesen aus der Datenbank.
 *  - `pdfFormAttachments` (dieser Turn): seit #2835 in `streamContext` auf
 *    dasselbe Urteil GEFILTERT — `attachmentProcessing` reicht seine
 *    AcroForm-Prüfung als `pdfIsFillable` weiter, statt sie nur für die
 *    Persistenz zu verwenden. Die Liste existiert überhaupt nur, weil
 *    `threadAttachments` erst nach dem Turn geschrieben wird: auf dem
 *    allerersten Turn („hier ist mein Formular") hätte die strenge Hälfte
 *    sonst nichts zu lesen.
 *
 * Ganz deckungsgleich sind die Wege nicht: die Persistenz kennt zusätzlich
 * einen Grössendeckel (`MAX_PDF_BYTES_PERSISTED`), die Turn-Liste bewusst
 * nicht — ein übergrosses Formular ist in DIESEM Turn ausfüllbar, seine Bytes
 * liegen im Request; auf Folge-Turns ist es dann weg.
 *
 * Das Prädikat selbst bleibt synchron und darf es auch: die AcroForm-Prüfung
 * passiert einmal beim Upload (`attachmentProcessingService`), nicht hier —
 * eine Prüfung an dieser Stelle würde im Routing jedes angehängte PDF pro
 * Turn parsen.
 */
import { type ThreadAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

import { type ProcessedAttachmentMeta } from './attachmentProcessingService.js';

export function hasReachableForm(state: {
  pdfFormAttachments?: Array<{ name: string; data: string }> | undefined;
  threadAttachments?: ThreadAttachment[] | undefined;
}): boolean {
  if ((state.pdfFormAttachments?.length ?? 0) > 0) return true;
  return (state.threadAttachments ?? []).some(
    (a) => a.mimeType === 'application/pdf' && a.hasFileData
  );
}

/**
 * Dieses Turns Kandidaten für die Formularwerkzeuge: nur PDFs, deren
 * Upload-Prüfung (`pdfIsFillable`, attachmentProcessingService) Formularfelder
 * gefunden hat. Bewusst OHNE den Grössendeckel der Persistenz — die Bytes
 * liegen im Request. Von `streamContext` beim Bau des Turn-States gerufen.
 */
export function selectPdfFormAttachments(
  docAttachments: Array<{ name: string; type: string; data: string }>,
  processedMeta: ProcessedAttachmentMeta[]
): Array<{ name: string; data: string }> {
  const fillable = new Set(
    processedMeta.filter((m) => m.pdfIsFillable === true).map((m) => m.name)
  );
  return docAttachments
    .filter((a) => a.type === 'application/pdf' && fillable.has(a.name))
    .map((a) => ({ name: a.name, data: a.data }));
}
