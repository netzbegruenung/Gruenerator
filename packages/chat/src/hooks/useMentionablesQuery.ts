/**
 * React Query hooks that fetch dynamic @mention data (custom agents, boards,
 * docs) and keep the module-level mentionable lists in sync for synchronous
 * consumers like mentionParser.resolveMentionable.
 *
 * Mounting any consumer (typically GrueneratorComposer) triggers the queries.
 * React Query handles caching, deduplication, retry and refetch — replacing
 * the previous useEffect/setState dance plus a manual mentionablesActivated
 * flag.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { createChatApiClient } from '../context/ChatContext';
import {
  setBoardMentionables,
  setCustomAgents,
  setDocMentionables,
  setUserNotebookMentionables,
  type CustomAgentMentionable,
  type Mentionable,
} from '../lib/mentionables';

interface BoardListItem {
  id: string;
  title: string;
}

interface DocListItem {
  id: string;
  title: string;
  document_subtype?: string;
}

interface UserNotebookListItem {
  id: string;
  name: string;
}

const STALE_TIME = 60_000;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function useApiClient() {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  return useMemo(() => createChatApiClient(fetchFn, onUnauthorized), [fetchFn, onUnauthorized]);
}

export function useCustomAgentsQuery() {
  const apiClient = useApiClient();
  return useQuery<CustomAgentMentionable[]>({
    queryKey: ['mention-custom-agents'],
    queryFn: async () => {
      const [ownPrompts, savedPrompts] = await Promise.all([
        apiClient.get<{ prompts?: CustomAgentMentionable[] }>('/auth/custom_prompts'),
        apiClient.get<{ prompts?: CustomAgentMentionable[] }>('/auth/saved_prompts'),
      ]);
      const seenIds = new Set<string>();
      const merged: CustomAgentMentionable[] = [];
      for (const p of [...(ownPrompts?.prompts ?? []), ...(savedPrompts?.prompts ?? [])]) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          merged.push(p);
        }
      }
      setCustomAgents(merged);
      return merged;
    },
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useBoardsQuery() {
  const apiClient = useApiClient();
  return useQuery<BoardListItem[]>({
    queryKey: ['mention-boards'],
    queryFn: async () => {
      const boards = await apiClient.get<BoardListItem[]>('/api/boards');
      const list = Array.isArray(boards) ? boards : [];
      setBoardMentionables(list.map((b) => ({ id: b.id, title: b.title, slug: slugify(b.title) })));
      return list;
    },
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useDocsQuery() {
  const apiClient = useApiClient();
  return useQuery<DocListItem[]>({
    queryKey: ['mention-docs'],
    queryFn: async () => {
      const docs = await apiClient.get<DocListItem[]>('/api/docs');
      const list = Array.isArray(docs) ? docs.filter((d) => d.document_subtype !== 'boards') : [];
      setDocMentionables(list.map((d) => ({ id: d.id, title: d.title, slug: slugify(d.title) })));
      return list;
    },
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useUserNotebooksQuery() {
  const apiClient = useApiClient();
  return useQuery<UserNotebookListItem[]>({
    queryKey: ['mention-user-notebooks'],
    queryFn: async () => {
      const res = await apiClient
        .get<{ collections?: UserNotebookListItem[] }>('/auth/notebook-collections')
        .catch(() => ({ collections: [] }));
      const list = Array.isArray(res?.collections) ? res.collections : [];
      setUserNotebookMentionables(
        list.map((n) => ({ id: n.id, title: n.name, slug: slugify(n.name) }))
      );
      return list;
    },
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/**
 * Convenience hook that triggers all dynamic-mentionable queries — call from
 * the chat composer so dynamic mentionables are warm by the time @-popovers
 * open.
 */
export function useMentionablesQuery(): void {
  useCustomAgentsQuery();
  useBoardsQuery();
  useDocsQuery();
  useUserNotebooksQuery();
}

/**
 * Returns the user's collaborative documents formatted as Mentionables, ready
 * for the @docs picker. Re-renders automatically when the docs query resolves.
 */
export function useDocMentionables(): Mentionable[] {
  const { data } = useDocsQuery();
  return useMemo(() => {
    if (!data) return [];
    return data.map<Mentionable>((d) => ({
      type: 'doc',
      category: 'function',
      trigger: '@',
      identifier: d.id,
      title: d.title,
      description: d.title,
      avatar: '📝',
      backgroundColor: '#0891B2',
      mention: slugify(d.title),
    }));
  }, [data]);
}
