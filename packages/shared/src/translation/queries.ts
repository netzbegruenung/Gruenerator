/**
 * Data hooks for the translator, shared by web and mobile. Languages, text and
 * the document-job status go through the ts-rest client; the document upload
 * and the result download are binary calls the contract does not model, so
 * each app keeps those (multipart in, file out) and reuses the errors here.
 */
import {
  type TranslateTextBody,
  type TranslateTextResponse,
  type TranslationDocumentStatusResponse,
  type TranslationLanguagesResponse,
  type TranslationQuota,
} from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getContractsClient } from '../api/contractsClient.js';

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
export function isNotConfigured(status: number, body: unknown): boolean {
  return status === 503 && (body as { code?: unknown } | null)?.code !== 'budget_unavailable';
}

export function errorText(body: unknown, fallback: string): string {
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
    // As long as it counts as fresh. With the clients' shorter defaults the
    // hour only held while the page stayed open; every later visit fetched again.
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** Keeps the budget line current without refetching the whole language list. */
export function useQuotaUpdater() {
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
