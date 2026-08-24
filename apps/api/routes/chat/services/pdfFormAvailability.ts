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
 * GELTUNGSBEREICH — die beiden Hälften sind NICHT gleich streng:
 *
 *  - `threadAttachments` (frühere Turns) ist streng. `hasFileData` ist das
 *    Urteil von `isFillablePdf`, nachgelesen aus der Datenbank.
 *  - `pdfFormAttachments` (dieser Turn) ist es nicht. Die Liste ist bewusst
 *    UNGEFILTERT — jedes PDF dieses Turns, nicht nur die ausfüllbaren
 *    (`streamContext.ts`: „Kept unfiltered here (the AcroForm probe happens in
 *    the tool)"). Sie existiert überhaupt nur, weil `threadAttachments` erst
 *    nach dem Turn geschrieben wird: auf dem allerersten Turn („hier ist mein
 *    Formular") hätte die strenge Hälfte sonst nichts zu lesen.
 *
 * Für den Upload-Turn eines Nicht-Formular-PDFs bleibt der Fehlschluss damit
 * bestehen: die Werkzeuge werden montiert. Der Ausfall ist dort aber ein
 * anderer und ein deutlich milderer — die Bytes LIEGEN vor, `resolvePdf`
 * gelingt, und `read_pdf_form` antwortet mit `fieldCount: 0` und dem Hinweis,
 * dass automatisches Ausfüllen hier nicht geht. Das ist die ehrliche Meldung,
 * die der Kopfkommentar in `toolCatalog` einmal für den ganzen Fall in
 * Anspruch nahm; über `threadAttachments` traf sie nicht zu, hier trifft sie zu.
 *
 * Zu schliessen wäre die Hälfte, indem `attachmentProcessing` sein bereits
 * berechnetes `isFillablePdf`-Urteil an `pdfFormAttachments` weiterreicht,
 * statt es nur für die Persistenz zu verwenden. Hier bewusst nicht getan: das
 * Prädikat ist synchron und wird im Routing pro Turn gerufen, eine
 * AcroForm-Prüfung an dieser Stelle würde jedes angehängte PDF parsen.
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
