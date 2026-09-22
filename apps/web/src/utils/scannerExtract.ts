/**
 * Reads the plain text out of a file through `POST /api/scanner/extract` — the
 * one OCR door the web app has. Behind it sits `OcrService` (Docling → Mistral
 * OCR → PDF.js fallback), the same path the Scanner page uses.
 *
 * It lives here rather than in a feature folder because two features now need
 * the identical call: recipe examples ("Rezepte") and the Übersetzer's image
 * tab. What differs between them is policy — which extensions to offer, whether
 * to short-circuit plain text — and that stays with each caller.
 *
 * The route answers 400/413 with a readable German sentence, so the useful text
 * only lives on the response body; axios turns those into a rejection and would
 * otherwise leave the caller with "Request failed with status code 400".
 */
import { scannerExtractErrorSchema, scannerExtractResponseSchema } from '@gruenerator/contracts';
import axios from 'axios';

import apiClient from '@/components/utils/apiClient';

export async function extractTextFromFile(file: File): Promise<string> {
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
    if (axios.isAxiosError(error)) {
      const body = scannerExtractErrorSchema.safeParse(error.response?.data);
      if (body.success) throw new Error(body.data.error);
      throw new Error(`„${file.name}" konnte nicht gelesen werden.`);
    }
    throw error;
  }
}
