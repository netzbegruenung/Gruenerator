/**
 * Welche Konnektor-Dateien der Abruf in `connectRetrieval.ts` lesen kann.
 *
 * Steht getrennt vom Abruf, weil zwei Stellen dieselbe Antwort brauchen: der
 * Abruf entscheidet damit, ob Graph nach PDF umwandeln muss, und die
 * Ordneransicht graut aus, was er nicht lesen könnte.
 */
import { isSupportedWolkeFile } from '../sync/supportedFileTypes.js';

import type { NangoProviderKey } from '../../config/nango.js';

/**
 * Office formats the extraction pipeline can't read but Graph converts to PDF
 * (`?format=pdf`). DOCX/PPTX stay native — OCR reads them directly.
 */
export const GRAPH_PDF_CONVERTIBLE = /\.(xlsx|xlsm|xls|ods|doc|odt|rtf|ppt|pps|ppsx|odp)$/i;

/** Google-Formate, die der Abruf exportiert statt herunterlädt. */
const GOOGLE_EXPORTABLE = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
]);

export function isConnectFileSupported(
  provider: NangoProviderKey,
  name: string,
  mimeType: string | null
): boolean {
  switch (provider) {
    case 'microsoft':
      return isSupportedWolkeFile(name) || GRAPH_PDF_CONVERTIBLE.test(name);
    case 'google':
      return (mimeType !== null && GOOGLE_EXPORTABLE.has(mimeType)) || isSupportedWolkeFile(name);
    default:
      return true;
  }
}
