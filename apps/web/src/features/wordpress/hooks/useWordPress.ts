import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchWordPressSites,
  addWordPressSite,
  deleteWordPressSite,
  testWordPressConnection,
  publishToWordPress,
  fetchWordPressPosts,
  fetchWordPressCategories,
  type WordPressSite,
  type WordPressConnectionTestResult,
  type WordPressPublishResult,
  type WordPressPost,
  type WordPressCategory,
} from '../lib/wordpressApi';

// ── Query Keys ────────────────────────────────────────────────────────

const wordpressKeys = {
  all: ['wordpress'] as const,
  sites: () => ['wordpress', 'sites'] as const,
  posts: (siteId: string) => ['wordpress', 'posts', siteId] as const,
  categories: (siteId: string) => ['wordpress', 'categories', siteId] as const,
};

// ── Query Hooks ───────────────────────────────────────────────────────

export function useWordPressSites(options?: { enabled?: boolean }) {
  return useQuery<WordPressSite[]>({
    queryKey: wordpressKeys.sites(),
    queryFn: fetchWordPressSites,
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useWordPressPosts(siteId: string | null) {
  return useQuery<WordPressPost[]>({
    queryKey: wordpressKeys.posts(siteId!),
    queryFn: () => fetchWordPressPosts(siteId!),
    staleTime: 30_000,
    enabled: !!siteId,
  });
}

export function useWordPressCategories(siteId: string | null) {
  return useQuery<WordPressCategory[]>({
    queryKey: wordpressKeys.categories(siteId!),
    queryFn: () => fetchWordPressCategories(siteId!),
    staleTime: 60_000,
    enabled: !!siteId,
  });
}

// ── Mutation Hooks ────────────────────────────────────────────────────

export function useAddWordPressSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteUrl,
      username,
      appPassword,
      label,
    }: {
      siteUrl: string;
      username: string;
      appPassword: string;
      label: string | null;
    }) => addWordPressSite(siteUrl, username, appPassword, label),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wordpressKeys.sites(),
      });
    },
  });
}

export function useDeleteWordPressSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWordPressSite(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wordpressKeys.sites(),
      });
    },
  });
}

export function useTestWordPressConnection() {
  return useMutation<
    WordPressConnectionTestResult,
    Error,
    { siteUrl: string; username: string; appPassword: string }
  >({
    mutationFn: ({ siteUrl, username, appPassword }) =>
      testWordPressConnection(siteUrl, username, appPassword),
  });
}

export function usePublishToWordPress() {
  return useMutation<
    WordPressPublishResult,
    Error,
    { siteId: string; title: string; content: string; status: string }
  >({
    mutationFn: ({ siteId, title, content, status }) =>
      publishToWordPress(siteId, title, content, status),
  });
}

// ── Re-exports ────────────────────────────────────────────────────────

export {
  wordpressKeys,
  type WordPressSite,
  type WordPressConnectionTestResult,
  type WordPressPublishResult,
  type WordPressPost,
  type WordPressCategory,
};
