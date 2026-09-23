/**
 * Reads the plain text out of a file the user drops into a recipe ("Rezept"),
 * so examples can be uploaded instead of pasted.
 *
 * Plain-text files are read in the browser — no round trip, and no OCR bill for
 * something the FileReader already understands. Everything else goes through
 * `extractTextFromFile`, the shared /api/scanner/extract call; the provider is
 * left unset so the backend default applies.
 */
import { extractTextFromFile } from '@/utils/scannerExtract';

const PLAIN_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv'];

/** Extensions the file picker offers — plain text plus whatever the OCR route accepts. */
export const EXAMPLE_FILE_ACCEPT = '.txt,.md,.markdown,.csv,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp';

function isPlainText(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  const name = file.name.toLowerCase();
  return PLAIN_TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function extractExampleText(file: File): Promise<string> {
  if (isPlainText(file)) return file.text();
  return extractTextFromFile(file);
}
