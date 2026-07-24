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

import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('pdfVerification');

export interface TypeAreaBounds {
  left: number;
  right: number;
  /** Baselines below this are inside the footer strip. */
  bottom: number;
}

export interface PdfVerification {
  pages: number;
  /** Characters recovered from the text layer — 0 means nothing is readable. */
  extractedChars: number;
  hasStructureTree: boolean;
  isMarkedTagged: boolean;
  hasLanguage: boolean;
  hasTitle: boolean;
  showsTitleInViewer: boolean;
  /** XMP stream declaring PDF/UA-1 — what validators and readers look for. */
  hasUaIdentifier: boolean;
  formFields: string[];
  /** Fields lacking /TU — a screen reader would announce the raw field name. */
  fieldsWithoutLabel: string[];
  /** Text that leaves the type area: cut off at the edge or over the footer. */
  overflowingText: string[];
  problems: string[];
}

/**
 * Read the text layer the way a screen reader would. pdfjs is the only
 * dependency here that actually interprets the content stream, so it is the
 * honest check — pdf-lib would only confirm that we wrote what we wrote.
 */
async function scanTextLayer(
  bytes: Buffer,
  bounds?: TypeAreaBounds
): Promise<{ chars: number; overflowing: string[] }> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: false,
    });
    const doc = await task.promise;
    let chars = 0;
    const overflowing: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      // includeMarkedContent lets us tell decoration from content: the footer
      // legitimately sits below the type area, but it is an /Artifact.
      const content = await page.getTextContent({ includeMarkedContent: true });
      let artifactDepth = 0;
      for (const item of content.items) {
        if ('type' in item) {
          const marked = item as { type: string; tag?: string | null };
          if (marked.type.startsWith('beginMarkedContent')) {
            if (marked.tag === 'Artifact' || artifactDepth > 0) artifactDepth += 1;
          } else if (marked.type === 'endMarkedContent' && artifactDepth > 0) {
            artifactDepth -= 1;
          }
          continue;
        }
        if (!('str' in item)) continue;
        chars += item.str.trim().length;
        if (!bounds || !item.str.trim() || artifactDepth > 0 || overflowing.length >= 5) continue;
        // transform[4]/[5] are the baseline origin of the text run; pdfjs types
        // the matrix as any[].
        const transform = item.transform as number[];
        const x = transform[4];
        const y = transform[5];
        const right = x + (item.width ?? 0);
        // 1pt of slack: glyph advance widths and pdfjs measurement differ
        // slightly, and a hairline is not a layout defect.
        if (right > bounds.right + 1 || x < bounds.left - 1 || y < bounds.bottom - 1) {
          overflowing.push(`Seite ${i}: "${item.str.trim().slice(0, 40)}"`);
        }
      }
    }
    await task.destroy();
    return { chars, overflowing };
  } catch (err) {
    log.warn(
      `[pdfVerification] text extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { chars: -1, overflowing: [] };
  }
}

export async function verifyPdf(bytes: Buffer, bounds?: TypeAreaBounds): Promise<PdfVerification> {
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

  // The XMP stream is where the PDF/UA claim lives; the Info dictionary is not
  // enough for a validator or a reader.
  let hasUaIdentifier = false;
  const metadataRef = catalog.get(PDFName.of('Metadata'));
  const metadata = metadataRef ? doc.context.lookup(metadataRef) : null;
  if (metadata instanceof PDFRawStream) {
    hasUaIdentifier = Buffer.from(metadata.contents).toString('utf8').includes('pdfuaid:part');
  }

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

  const { chars: extractedChars, overflowing: overflowingText } = await scanTextLayer(
    bytes,
    bounds
  );

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
  if (!hasUaIdentifier) {
    problems.push('Die PDF/UA-Kennung fehlt — das Dokument weist sich nicht als barrierefrei aus.');
  }
  if (pagesMissingStructParents > 0) {
    problems.push(`${pagesMissingStructParents} Seite(n) ohne Strukturzuordnung.`);
  }
  if (fieldsWithoutLabel.length) {
    problems.push(
      `${fieldsWithoutLabel.length} Formularfeld(er) ohne Beschriftung für Screenreader.`
    );
  }
  if (overflowingText.length) {
    problems.push(
      `Text verlässt den Satzspiegel (abgeschnitten oder über der Fußzeile): ${overflowingText.join('; ')}`
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
    hasUaIdentifier,
    formFields,
    fieldsWithoutLabel,
    overflowingText,
    problems,
  };
}

/** Compact, model-facing summary — the tool relays this to the user verbatim. */
export function summarizeVerification(v: PdfVerification): string {
  const parts = [
    `${v.pages} Seite(n)`,
    v.extractedChars >= 0 ? `${v.extractedChars} Zeichen auslesbar` : 'Textprüfung nicht möglich',
    v.hasStructureTree && v.isMarkedTagged && v.hasUaIdentifier
      ? 'getaggt nach PDF/UA-1'
      : 'NICHT getaggt',
  ];
  if (v.formFields.length) parts.push(`${v.formFields.length} Formularfeld(er)`);
  return parts.join(', ');
}
