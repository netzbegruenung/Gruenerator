/**
 * Reads the plain text out of a file the user drops into a recipe ("Rezept"),
 * so examples can be uploaded instead of pasted.
 *
 * Plain-text files are read in the browser — no round trip, and no OCR bill for
 * something the FileReader already understands. Everything else goes through the
 * existing /api/scanner/extract endpoint (PDF, DOCX, PPTX, images), which is the
 * same OCR path the Scanner tab uses; the provider is left unset so the backend
 * default applies.
 */
import { scannerExtractErrorSchema, scannerExtractResponseSchema } from '@gruenerator/contracts';
import axios from 'axios';

import apiClient from '@/components/utils/apiClient';

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

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await apiClient.post<unknown>('/scanner/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const parsed = scannerExtractResponseSchema.parse(response.data);
    if (!parsed.success) throw new Error(parsed.error);
    return parsed.text;
  } catch (error) {
    // The route answers 400/413 with a readable German message — axios turns
    // those into a rejection, so the useful text only lives on the response body.
    if (axios.isAxiosError(error)) {
      const body = scannerExtractErrorSchema.safeParse(error.response?.data);
      if (body.success) throw new Error(body.data.error);
      throw new Error(`„${file.name}" konnte nicht gelesen werden.`);
    }
    throw error;
  }
}
