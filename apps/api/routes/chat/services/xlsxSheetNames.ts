/**
 * Deterministic sheet-name extraction for uploaded .xlsx workbooks.
 *
 * The pandas codegen must know which sheets exist to answer cross-sheet
 * questions (the browser setup exposes them as `sheets['Name']`), and the
 * OCR text extraction (Docling/Mistral) gives no guarantee that sheet names
 * survive into the extracted text. An .xlsx is a zip whose xl/workbook.xml
 * lists the sheets in workbook order — reading that one entry is cheap and
 * exact. Fail-open: any parse problem returns null and the attachment text
 * simply stays unannotated.
 */
import AdmZip from 'adm-zip';

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('XlsxSheetNames');

const SHEET_TAG = /<sheet\b[^>]*?\sname="([^"]*)"/g;

/** The five XML entities that can appear in an attribute value. */
function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractXlsxSheetNames(fileBytes: Buffer): string[] | null {
  try {
    const workbookXml = new AdmZip(fileBytes).readAsText('xl/workbook.xml');
    if (!workbookXml) return null;
    const names = [...workbookXml.matchAll(SHEET_TAG)].map((m) => unescapeXml(m[1]));
    return names.length > 0 ? names : null;
  } catch (error) {
    log.warn(
      `Could not read workbook sheet names: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Context line prepended to the extracted text of multi-sheet workbooks so
 * the codegen (and every other consumer of the attachment text) knows the
 * sheet map. Single-sheet files stay unannotated — `df` is the whole story.
 */
export function describeWorkbookSheets(fileBytes: Buffer): string | null {
  const names = extractXlsxSheetNames(fileBytes);
  if (!names || names.length < 2) return null;
  return `[Arbeitsmappe mit ${names.length} Blättern: ${names.join(', ')}. Im Python-Interpreter ist df das Blatt '${names[0]}', alle Blätter sind über sheets['Blattname'] verfügbar.]`;
}
