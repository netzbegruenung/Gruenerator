/**
 * The web side of the translator's data layer. Languages, text and the job
 * status are shared with mobile (`@gruenerator/shared/translation`); the
 * document upload and the result download are the two binary calls the
 * contract does not model, so they use the axios client directly (multipart
 * in, blob out).
 */
import {
  type TranslationDocumentUploadResponse,
  type TranslationFormality,
  type TranslationQuota,
} from '@gruenerator/contracts';
import {
  errorText,
  isNotConfigured,
  TranslationNotConfiguredError,
  TranslationRequestError,
} from '@gruenerator/shared/translation';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import apiClient from '../../../components/utils/apiClient';
import { downloadBlob } from '../../../utils/downloadFile';

export {
  LANGUAGES_QUERY_KEY,
  TranslationNotConfiguredError,
  TranslationRequestError,
  useDocumentStatus,
  useTranslateText,
  useTranslationLanguages,
} from '@gruenerator/shared/translation';

export interface DocumentUploadInput {
  file: File;
  targetLang: string;
  sourceLang: string | null;
  formality: TranslationFormality | null;
  outputFormat: 'docx' | null;
}

export function useUploadDocument() {
  return useMutation({
    mutationFn: async (input: DocumentUploadInput): Promise<TranslationDocumentUploadResponse> => {
      const form = new FormData();
      form.append('document', input.file);
      form.append('targetLang', input.targetLang);
      if (input.sourceLang) form.append('sourceLang', input.sourceLang);
      if (input.formality && input.formality !== 'default')
        form.append('formality', input.formality);
      if (input.outputFormat) form.append('outputFormat', input.outputFormat);
      try {
        // No Content-Type header: axios sets the multipart boundary itself.
        const response = await apiClient.post<TranslationDocumentUploadResponse>(
          '/translation/document',
          form
        );
        return response.data;
      } catch (error) {
        if (isAxiosError(error) && error.response) {
          const status = error.response.status;
          if (isNotConfigured(status, error.response.data))
            throw new TranslationNotConfiguredError();
          const data = error.response.data as { quota?: TranslationQuota | null } | null;
          throw new TranslationRequestError(
            errorText(data, 'Das Dokument konnte nicht hochgeladen werden.'),
            status,
            data?.quota ?? null
          );
        }
        throw error;
      }
    },
  });
}

/** Fetches the buffered result and hands it to the browser as a download. */
export async function downloadTranslatedDocument(jobId: string, filename: string): Promise<void> {
  const response = await apiClient.get<Blob>(`/translation/document/${jobId}/result`, {
    responseType: 'blob',
  });
  await downloadBlob(response.data, filename);
}
