/**
 * The account glossary for the admin tab — read whole, written per language
 * pair. DeepL is the source of truth (no table on our side), so every write
 * invalidates the read and the translator's language query, whose
 * `glossaryPairs` decide when a source language becomes mandatory.
 */
import {
  type GlossaryDictionary,
  type GlossaryDictionaryPut,
  type GlossaryResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const GLOSSARY_KEY = ['admin', 'translation-glossary'] as const;
const LANGUAGES_KEY = ['translation', 'languages'] as const;

function errorText(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error ? error : fallback;
}

export function useGlossary() {
  return useQuery({
    queryKey: GLOSSARY_KEY,
    queryFn: async (): Promise<GlossaryResponse> => {
      const result = await getContractsClient().translation.getGlossary();
      if (result.status === 200) return result.body;
      throw new Error(errorText(result.body, 'Das Glossar konnte nicht geladen werden.'));
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function useTranslationLanguagesForAdmin() {
  return useQuery({
    queryKey: LANGUAGES_KEY,
    queryFn: async () => {
      const result = await getContractsClient().translation.getLanguages();
      if (result.status === 200) return result.body;
      throw new Error(errorText(result.body, 'Sprachen konnten nicht geladen werden.'));
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: GLOSSARY_KEY });
    void queryClient.invalidateQueries({ queryKey: LANGUAGES_KEY });
  };
}

export function useSaveDictionary() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: GlossaryDictionaryPut): Promise<GlossaryDictionary> => {
      const result = await getContractsClient().translation.putGlossaryDictionary({ body });
      if (result.status === 200) return result.body;
      throw new Error(errorText(result.body, 'Das Wörterbuch konnte nicht gespeichert werden.'));
    },
    onSuccess: invalidate,
  });
}

export function useDeleteDictionary() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (pair: { sourceLang: string; targetLang: string }): Promise<void> => {
      const result = await getContractsClient().translation.deleteGlossaryDictionary({
        query: pair,
      });
      if (result.status !== 200) {
        throw new Error(errorText(result.body, 'Das Wörterbuch konnte nicht gelöscht werden.'));
      }
    },
    onSuccess: invalidate,
  });
}
