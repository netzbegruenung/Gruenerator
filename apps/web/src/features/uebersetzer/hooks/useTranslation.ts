/**
 * Data hooks for the translator page. Text, languages and the document-job
 * status go through the ts-rest client; the document upload and the result
 * download are the two binary calls the contract does not model, so they use
 * the axios client directly (multipart in, blob out).
 */
import {
  type TranslateTextBody,
  type TranslateTextResponse,
  type TranslationDocumentStatusResponse,
  type TranslationDocumentUploadResponse,
  type TranslationFormality,
  type TranslationLanguagesResponse,
  type TranslationQuota,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import apiClient from '../../../components/utils/apiClient';

export const LANGUAGES_QUERY_KEY = ['translation', 'languages'] as const;

/** 503 from the API: no DeepL key on this server. The page shows a notice, not an error. */
export class TranslationNotConfiguredError extends Error {
  constructor() {
    super('Die Übersetzung ist auf diesem Server nicht eingerichtet.');
    this.name = 'TranslationNotConfiguredError';
  }
}

export class TranslationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly quota: TranslationQuota | null = null
  ) {
    super(message);
    this.name = 'TranslationRequestError';
  }
}

/**
 * Two very different things answer 503: this server has no DeepL key, and the
 * tree budget could not be read (Redis). Only the first is a notice — the
 * second is a real error whose sentence the server already wrote.
 */
function isNotConfigured(status: number, body: unknown): boolean {
  return status === 503 && (body as { code?: unknown } | null)?.code !== 'budget_unavailable';
}

function errorText(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error ? error : fallback;
}

export function useTranslationLanguages() {
  return useQuery({
    queryKey: LANGUAGES_QUERY_KEY,
    queryFn: async (): Promise<TranslationLanguagesResponse> => {
      const result = await getContractsClient().translation.getLanguages();
      if (result.status === 200) return result.body;
      if (isNotConfigured(result.status, result.body)) throw new TranslationNotConfiguredError();
      throw new TranslationRequestError(
        errorText(result.body, 'Sprachen konnten nicht geladen werden.'),
        result.status
      );
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** Keeps the budget line current without refetching the whole language list. */
function useQuotaUpdater() {
  const queryClient = useQueryClient();
  return (quota: TranslationQuota) => {
    queryClient.setQueryData<TranslationLanguagesResponse>(LANGUAGES_QUERY_KEY, (old) =>
      old ? { ...old, quota } : old
    );
  };
}

export function useTranslateText() {
  const updateQuota = useQuotaUpdater();
  return useMutation({
    mutationFn: async (body: TranslateTextBody): Promise<TranslateTextResponse> => {
      const result = await getContractsClient().translation.translateText({ body });
      if (result.status === 200) return result.body;
      if (isNotConfigured(result.status, result.body)) throw new TranslationNotConfiguredError();
      const quota = (result.body as { quota?: TranslationQuota | null } | null)?.quota ?? null;
      throw new TranslationRequestError(
        errorText(result.body, 'Die Übersetzung ist fehlgeschlagen.'),
        result.status,
        quota
      );
    },
    onSuccess: (data) => updateQuota(data.quota),
    onError: (error) => {
      if (error instanceof TranslationRequestError && error.quota) updateQuota(error.quota);
    },
  });
}

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

const POLL_INTERVAL_MS = 3000;

export function useDocumentStatus(jobId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['translation', 'document', jobId] as const,
    enabled: jobId !== null,
    retry: false,
    queryFn: async (): Promise<TranslationDocumentStatusResponse> => {
      const result = await getContractsClient().translation.getDocumentStatus({
        params: { jobId: jobId! },
      });
      if (result.status === 200) {
        if (result.body.status === 'done') {
          // The budget moved server-side; refresh the line on the next paint.
          void queryClient.invalidateQueries({ queryKey: LANGUAGES_QUERY_KEY });
        }
        return result.body;
      }
      if (isNotConfigured(result.status, result.body)) throw new TranslationNotConfiguredError();
      throw new TranslationRequestError(
        errorText(result.body, 'Der Stand der Übersetzung ist unbekannt.'),
        result.status
      );
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'translating' ? POLL_INTERVAL_MS : false;
    },
  });
}

/** Fetches the buffered result and hands it to the browser as a download. */
export async function downloadTranslatedDocument(jobId: string, filename: string): Promise<void> {
  const response = await apiClient.get<Blob>(`/translation/document/${jobId}/result`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Give the click a tick before revoking, or Safari cancels the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
