/**
 * The mobile side of the translator's document calls: the upload and the
 * result download are binary, outside the ts-rest contract, so each app keeps
 * its own. Languages, text and the job status come from
 * `@gruenerator/shared/translation`, and so do the errors these throw.
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
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getGlobalApiClient } from '../../services/api';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { secureStorage } from '../../services/storage';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface DocumentUploadInput {
  file: PickedFile;
  targetLang: string;
  sourceLang: string | null;
  formality: TranslationFormality | null;
  outputFormat: 'docx' | null;
}

export function useUploadDocument() {
  return useMutation({
    mutationFn: async (input: DocumentUploadInput): Promise<TranslationDocumentUploadResponse> => {
      const form = new FormData();
      // React Native's FormData takes a file as { uri, name, type }.
      form.append('document', {
        uri: input.file.uri,
        name: input.file.name,
        type: input.file.mimeType,
      } as unknown as Blob);
      form.append('targetLang', input.targetLang);
      if (input.sourceLang) form.append('sourceLang', input.sourceLang);
      if (input.formality && input.formality !== 'default')
        form.append('formality', input.formality);
      if (input.outputFormat) form.append('outputFormat', input.outputFormat);
      try {
        const response = await getGlobalApiClient().post<TranslationDocumentUploadResponse>(
          '/translation/document',
          form,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }
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

/** Fetches the finished translation into the cache and opens the share sheet for it. */
export async function shareTranslatedDocument(jobId: string, filename: string): Promise<void> {
  const token = await secureStorage.getToken();
  const safeName = filename.replace(/[/\\:*?"<>|]/g, '_');
  const target = new File(Paths.cache, safeName);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(
    resolveChatUrl(`/api/translation/document/${jobId}/result`),
    target,
    { idempotent: true, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) }
  );
  await Sharing.shareAsync(file.uri, { dialogTitle: filename });
}
