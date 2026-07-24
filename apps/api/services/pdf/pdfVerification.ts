/**
 * Post-render self-check.
 *
 * A PDF that renders without throwing can still be broken in ways only a reader
 * notices: no text layer (nothing selectable or readable by a screen reader),
 * a structure tree that got dropped, form fields that never made it into the
 * AcroForm. So the finished bytes are re-opened and inspected before the file
 * is handed to the user — and the result is reported back to the model, which
 * is told to relay problems instead of claiming success.
 */

import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('pdfVerification');

export interface PdfVerification {
  pages: number;
  /** Characters recovered from the text layer — 0 means nothing is readable. */
  extractedChars: number;
  hasStructureTree: boolean;
  isMarkedTagged: boolean;
  hasLanguage: boolean;
  hasTitle: boolean;
  showsTitleInViewer: boolean;
  formFields: string[];
  /** Fields lacking /TU — a screen reader would announce the raw field name. */
  fieldsWithoutLabel: string[];
  problems: string[];
}

/**
 * Read the text layer the way a screen reader would. pdfjs is the only
 * dependency here that actually interprets the content stream, so it is the
 * honest check — pdf-lib would only confirm that we wrote what we wrote.
 */
async function extractedTextLength(bytes: Buffer): Promise<number> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: false,
    });
    const doc = await task.promise;
    let total = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item) total += item.str.trim().length;
      }
    }
    await task.destroy();
    return total;
  } catch (err) {
    log.warn(
      `[pdfVerification] text extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return -1;
  }
}

export async function verifyPdf(bytes: Buffer): Promise<PdfVerification> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const catalog = doc.catalog;

  const hasStructureTree = Boolean(catalog.get(PDFName.of('StructTreeRoot')));
  const markInfo = catalog.lookupMaybe(PDFName.of('MarkInfo'), PDFDict);
  const isMarkedTagged = String(markInfo?.get(PDFName.of('Marked')) ?? '') === 'true';
  const hasLanguage = Boolean(catalog.get(PDFName.of('Lang')));
  const title = doc.getTitle();
  const hasTitle = Boolean(title && title.trim());

  const viewerPrefs = catalog.lookupMaybe(PDFName.of('ViewerPreferences'), PDFDict);
  const showsTitleInViewer =
    String(viewerPrefs?.get(PDFName.of('DisplayDocTitle')) ?? '') === 'true';

  const formFields: string[] = [];
  const fieldsWithoutLabel: string[] = [];
  try {
    for (const field of doc.getForm().getFields()) {
      const name = field.getName();
      formFields.push(name);
      const hasTooltip =
        Boolean(field.acroField.dict.get(PDFName.of('TU'))) ||
        field.acroField.getWidgets().some((widget) => Boolean(widget.dict.get(PDFName.of('TU'))));
      if (!hasTooltip) fieldsWithoutLabel.push(name);
    }
  } catch (err) {
    log.warn(
      `[pdfVerification] form read failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const pagesMissingStructParents = doc
    .getPages()
    .filter((page) => !(page.node.get(PDFName.of('StructParents')) instanceof PDFNumber)).length;

  const extractedChars = await extractedTextLength(bytes);

  const problems: string[] = [];
  if (extractedChars === 0) {
    problems.push('Das PDF enthält keinen auslesbaren Text (leere Textebene).');
  }
  if (!hasStructureTree || !isMarkedTagged) {
    problems.push(
      'Das PDF ist nicht getaggt — Screenreader können es nicht strukturiert vorlesen.'
    );
  }
  if (!hasLanguage) problems.push('Die Dokumentsprache fehlt.');
  if (!hasTitle) problems.push('Der Dokumenttitel fehlt.');
  if (!showsTitleInViewer) {
    problems.push('Der Titel wird im Reader nicht statt des Dateinamens angezeigt.');
  }
  if (pagesMissingStructParents > 0) {
    problems.push(`${pagesMissingStructParents} Seite(n) ohne Strukturzuordnung.`);
  }
  if (fieldsWithoutLabel.length) {
    problems.push(
      `${fieldsWithoutLabel.length} Formularfeld(er) ohne Beschriftung für Screenreader.`
    );
  }

  return {
    pages: doc.getPageCount(),
    extractedChars,
    hasStructureTree,
    isMarkedTagged,
    hasLanguage,
    hasTitle,
    showsTitleInViewer,
    formFields,
    fieldsWithoutLabel,
    problems,
  };
}

/** Compact, model-facing summary — the tool relays this to the user verbatim. */
export function summarizeVerification(v: PdfVerification): string {
  const parts = [
    `${v.pages} Seite(n)`,
    v.extractedChars >= 0 ? `${v.extractedChars} Zeichen auslesbar` : 'Textprüfung nicht möglich',
    v.hasStructureTree && v.isMarkedTagged ? 'getaggt (barrierefrei)' : 'NICHT getaggt',
  ];
  if (v.formFields.length) parts.push(`${v.formFields.length} Formularfeld(er)`);
  return parts.join(', ');
}
