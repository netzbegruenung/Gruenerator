/**
 * useNotebookTyped — typed wrappers for the 5 notebook interaction endpoints.
 *
 * GET endpoints (getFilters, getPublic) use useQuery.
 * POST endpoints (askMulti, askSingle, askPublic) use useMutation.
 *
 * The store API in notebookStore.ts is the primary consumer of getFilters;
 * the ask/public endpoints are wired here for typed React Query usage.
 *
 * Error pattern mirrors useBoardsTyped: throw on non-2xx so TanStack Query
 * surfaces the error in isError / error.message.
 */

import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery } from '@tanstack/react-query';

// ── Query key factories ──────────────────────────────────────────────────────

const NOTEBOOK_FILTERS_KEY = (collectionId: string) => ['notebook', 'filters', collectionId];
const NOTEBOOK_PUBLIC_KEY = (token: string) => ['notebook', 'public', token];

// ── Shared body shape ────────────────────────────────────────────────────────

export interface AskQuestionBody {
  question: string;
  filters?: Record<string, unknown> | null;
  collectionIds?: string[] | null;
  fastMode?: boolean | null;
}

// ── Filter query ─────────────────────────────────────────────────────────────

export const useNotebookFilters = (collectionId: string, enabled = true) => {
  return useQuery({
    queryKey: NOTEBOOK_FILTERS_KEY(collectionId),
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.notebook.getFilters({
        params: { id: collectionId },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to fetch notebook filters (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: enabled && collectionId.length > 0,
  });
};

// ── Public collection query ───────────────────────────────────────────────────

export const useNotebookPublic = (token: string, enabled = true) => {
  return useQuery({
    queryKey: NOTEBOOK_PUBLIC_KEY(token),
    queryFn: async () => {
      const client = getContractsClient();
      const result = await client.notebook.getPublic({
        params: { token },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to fetch public notebook collection (HTTP ${result.status})`);
      }
      return result.body;
    },
    enabled: enabled && token.length > 0,
  });
};

// ── Ask mutations ─────────────────────────────────────────────────────────────

export const useAskNotebookMulti = () => {
  return useMutation({
    mutationFn: async (body: AskQuestionBody) => {
      const client = getContractsClient();
      const result = await client.notebook.askMulti({
        body: {
          question: body.question,
          filters: body.filters ?? null,
          collectionIds: body.collectionIds ?? null,
          fastMode: body.fastMode ?? null,
        },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to ask notebook multi (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
};

export const useAskNotebookSingle = () => {
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: AskQuestionBody }) => {
      const client = getContractsClient();
      const result = await client.notebook.askSingle({
        params: { id },
        body: {
          question: body.question,
          filters: body.filters ?? null,
          collectionIds: body.collectionIds ?? null,
          fastMode: body.fastMode ?? null,
        },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to ask notebook single (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
};

export const useAskNotebookPublic = () => {
  return useMutation({
    mutationFn: async ({ token, body }: { token: string; body: AskQuestionBody }) => {
      const client = getContractsClient();
      const result = await client.notebook.askPublic({
        params: { token },
        body: {
          question: body.question,
          filters: body.filters ?? null,
          collectionIds: body.collectionIds ?? null,
          fastMode: body.fastMode ?? null,
        },
      });
      if (result.status !== 200) {
        throw new Error(`Failed to ask public notebook (HTTP ${result.status})`);
      }
      return result.body;
    },
  });
};

// ── Convenience bundle ────────────────────────────────────────────────────────

export const useNotebookTyped = () => ({
  askMulti: useAskNotebookMulti(),
  askSingle: useAskNotebookSingle(),
  askPublic: useAskNotebookPublic(),
});
