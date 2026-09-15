/**
 * The one list of file extensions the Wolke import can actually process.
 *
 * There used to be two: `WolkeSyncService.supportedFileTypes` (what
 * `processFile` will handle) and `SUPPORTED_FILE_TYPES` in wolkeController
 * (what the browse endpoint offers the UI). They had drifted apart in both
 * directions — `.pptx` and images were processable but never offered, `.doc`
 * was offered but rejected by `processFile` as 'unsupported_file_type'.
 *
 * Keep this list in sync with the extraction branches in
 * `WolkeSyncService.processFile`: everything here must be either an OCR type
 * or a plain-text type.
 */
import path from 'path';

/** Handled by Mistral OCR (documents and images). */
export const WOLKE_OCR_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.avif',
] as const;

/** Read straight off the buffer as UTF-8. */
export const WOLKE_PLAINTEXT_EXTENSIONS = ['.txt', '.md'] as const;

export const WOLKE_SUPPORTED_EXTENSIONS = [
  ...WOLKE_OCR_EXTENSIONS,
  ...WOLKE_PLAINTEXT_EXTENSIONS,
] as const;

/**
 * Der Scraper-Pfad (`wolkeShareHandler` → `ocrService.extractTextFromDocument`)
 * hat eine ANDERE Menge, und das ist kein Drift, sondern ein anderer Extraktor:
 * er reicht die Datei direkt an Mistral-OCR weiter, das `.doc` und `.xlsx` über
 * `getMediaType` kennt, aber keine Bilder gebrauchen kann — der Sync-Pfad geht
 * über `extractTextFromFile`, wo es umgekehrt liegt.
 *
 * Die Liste stand deshalb doppelt; hier steht sie neben ihrer Schwester, damit
 * der Unterschied sichtbar ist statt zufällig. Die Paarung mit `getMediaType`
 * bewacht `wolkeMediaTypes.vitest.ts`.
 */
export const WOLKE_SCRAPER_OCR_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.xlsx'] as const;

export type WolkeSupportedExtension = (typeof WOLKE_SUPPORTED_EXTENSIONS)[number];

/** Lowercased extension of a file name, including the leading dot ('' if none). */
export function wolkeFileExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function isSupportedWolkeFile(fileName: string): boolean {
  return (WOLKE_SUPPORTED_EXTENSIONS as readonly string[]).includes(wolkeFileExtension(fileName));
}

export function isOcrWolkeExtension(extension: string): boolean {
  return (WOLKE_OCR_EXTENSIONS as readonly string[]).includes(extension);
}

export function isPlaintextWolkeExtension(extension: string): boolean {
  return (WOLKE_PLAINTEXT_EXTENSIONS as readonly string[]).includes(extension);
}
