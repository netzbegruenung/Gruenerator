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
import { useEffect, useMemo } from 'react';

import { createChatApiClient } from '../context/ChatContext';
import {
  setHiddenSkillMentions,
  type Mentionable,
  type CustomAgentMentionable,
  type TextformMentionable,
} from '../lib/mentionables';
import {
  slugifyMention as slugify,
  syncBoards,
  syncCustomAgents,
  syncDocs,
  syncMcpServers,
  syncSheets,
  syncTextforms,
  syncUserNotebooks,
  type BoardListItem,
  type DocListItem,
  type McpServerListItem,
  type MentionableFetch,
  type UserNotebookListItem,
} from '../lib/mentionableSync';
import { useChatConfigStore } from '../stores/chatConfigStore';

const STALE_TIME = 60_000;

function useApiClient() {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  return useMemo(() => createChatApiClient(fetchFn, onUnauthorized), [fetchFn, onUnauthorized]);
}

/** The sync layer's `get` contract, backed by the chat ApiClient. */
function useMentionableFetch(): MentionableFetch {
  const apiClient = useApiClient();
  return useMemo(
    () =>
      <T>(path: string) =>
        apiClient.get<T>(path),
    [apiClient]
  );
}

export function useCustomAgentsQuery() {
  const get = useMentionableFetch();
  return useQuery<CustomAgentMentionable[]>({
    queryKey: ['mention-custom-agents'],
    queryFn: () => syncCustomAgents(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/**
 * User's custom text forms ("Texte anlernen") → per-form `/mention` skills.
 * Presets ride the existing system-skill mentions, so only custom forms surface
 * here. Anonymous users / no forms resolve to an empty list.
 */
export function useTextformsQuery() {
  const get = useMentionableFetch();
  return useQuery<TextformMentionable[]>({
    queryKey: ['mention-textforms'],
    queryFn: () => syncTextforms(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useBoardsQuery() {
  const get = useMentionableFetch();
  return useQuery<BoardListItem[]>({
    queryKey: ['mention-boards'],
    queryFn: () => syncBoards(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useSheetsQuery() {
  const get = useMentionableFetch();
  return useQuery<DocListItem[]>({
    queryKey: ['mention-sheets'],
    queryFn: () => syncSheets(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useDocsQuery() {
  const get = useMentionableFetch();
  return useQuery<DocListItem[]>({
    queryKey: ['mention-docs'],
    queryFn: () => syncDocs(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useUserNotebooksQuery() {
  const get = useMentionableFetch();
  return useQuery<UserNotebookListItem[]>({
    queryKey: ['mention-user-notebooks'],
    queryFn: () => syncUserNotebooks(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/**
 * User's connected external MCP servers → per-server @mentions (@notion,
 * @brevo, …). Only enabled servers become mentions; anonymous users / no
 * servers resolve to an empty list.
 */
export function useMcpServersQuery() {
  const get = useMentionableFetch();
  return useQuery<McpServerListItem[]>({
    queryKey: ['mention-mcp-servers'],
    queryFn: () => syncMcpServers(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export interface ChatShareLink {
  id: string;
  label?: string;
  share_link?: string;
  is_active?: boolean;
  baseUrl?: string;
}

export interface ChatWolkeFile {
  name: string;
  href: string;
  size: number | null;
  isDirectory?: boolean;
  fileExtension?: string;
  isSupported?: boolean;
  sizeFormatted?: string;
  lastModifiedFormatted?: string;
}

export interface ChatWolkeBrowse {
  shareLink: { id: string; label?: string; baseUrl?: string };
  files: ChatWolkeFile[];
}

/**
 * User's connected Nextcloud share links. Used by the @wolke picker to
 * resolve which share to browse and to render the empty-state when the user
 * has none. The endpoint is identical to the one apps/web's wolke feature
 * page uses — we just route it through the chat package's ChatAdapter so
 * mobile/desktop hosts don't need to set up the web-specific apiClient.
 */
export function useUserShareLinksQuery(enabled = true) {
  const apiClient = useApiClient();
  return useQuery<ChatShareLink[]>({
    queryKey: ['mention-wolke-share-links'],
    queryFn: async () => {
      const res = await apiClient.get<{ shareLinks?: ChatShareLink[] } | ChatShareLink[]>(
        '/api/nextcloud/share-links'
      );
      if (Array.isArray(res)) return res.filter((l) => l.is_active !== false);
      return (res?.shareLinks ?? []).filter((l) => l.is_active !== false);
    },
    // Re-fetch on every picker open: users add/remove share links via
    // /profile/verbindungen between sessions, and stale caching would keep
    // showing the "Keine Wolke verbunden" empty state after just connecting.
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
    retry: 1,
  });
}

/**
 * Folder listing for a single share link + path. Disabled until both
 * `shareLinkId` and `enabled` are truthy so we don't fire empty browses.
 */
export function useWolkeBrowseQuery(shareLinkId: string | null, path: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery<ChatWolkeBrowse>({
    queryKey: ['mention-wolke-browse', shareLinkId, path],
    queryFn: async () => {
      const qs = path ? `?path=${encodeURIComponent(path)}` : '';
      const res = await apiClient.get<ChatWolkeBrowse>(
        `/api/documents/wolke/browse/${shareLinkId}${qs}`
      );
      return {
        shareLink: res.shareLink,
        files: Array.isArray(res.files) ? res.files : [],
      };
    },
    enabled: !!shareLinkId && enabled,
    staleTime: 15_000,
    retry: 1,
  });
}

// ── @connect (Nango-connected provider files) ────────────────────────────────
//
// Mirrors the @wolke hooks above, but talks to /api/connections/* instead of
// the Nextcloud share-link endpoints. Used by the @connect picker to (1) list
// which providers the user has actually connected and (2) browse their files.

export interface ChatConnectProvider {
  provider: string;
  label: string;
  services: readonly string[];
  connected: boolean;
}

export interface ChatConnectFile {
  id: string;
  name: string;
  mimeType?: string;
  isDirectory?: boolean;
  sizeFormatted?: string;
}

/**
 * The user's Nango connection status, filtered to connected providers. Used by
 * the @connect picker to render the provider list and an empty-state when the
 * user hasn't connected anything yet. Re-fetches on open (users connect/
 * disconnect via /profile between sessions).
 */
export function useConnectProvidersQuery(enabled = true) {
  const apiClient = useApiClient();
  return useQuery<ChatConnectProvider[]>({
    queryKey: ['mention-connect-providers'],
    queryFn: async () => {
      const res = await apiClient.get<{ providers?: ChatConnectProvider[] }>(
        '/api/connections/status'
      );
      return (res?.providers ?? []).filter((p) => p.connected);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
    retry: 1,
  });
}

/**
 * File/folder listing for a single connected provider. The /files endpoint
 * returns a provider-specific shape (Google `{files}`, Microsoft `{items}`,
 * Jira `{projects}`, Confluence `{spaces}`) — normalize each into a flat
 * ChatConnectFile[] so the picker stays provider-agnostic. Disabled until both
 * `provider` and `enabled` are truthy.
 */
export function useConnectBrowseQuery(
  provider: string | null,
  folderId: string | null,
  enabled = true
) {
  const apiClient = useApiClient();
  return useQuery<ChatConnectFile[]>({
    queryKey: ['mention-connect-browse', provider, folderId],
    queryFn: async () => {
      const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
      const res = await apiClient.get<{
        files?: Array<{ id: string; name: string; mimeType?: string }>;
        items?: Array<{
          id: string;
          name: string;
          size?: number;
          file?: unknown;
          folder?: unknown;
        }>;
        projects?: Array<{ id: string; key: string; name: string }>;
        spaces?: Array<{ id: string; key: string; name: string }>;
      }>(`/api/connections/${provider}/files${qs}`);

      if (Array.isArray(res?.files)) {
        return res.files.map((f) => ({
          id: f.id,
          name: f.name,
          ...(f.mimeType ? { mimeType: f.mimeType } : {}),
          isDirectory: f.mimeType === 'application/vnd.google-apps.folder',
        }));
      }
      if (Array.isArray(res?.items)) {
        return res.items.map((i) => ({
          id: i.id,
          name: i.name,
          isDirectory: !!i.folder,
        }));
      }
      if (Array.isArray(res?.projects)) {
        return res.projects.map((p) => ({ id: p.key, name: p.name }));
      }
      if (Array.isArray(res?.spaces)) {
        return res.spaces.map((s) => ({ id: s.id, name: s.name }));
      }
      return [];
    },
    enabled: !!provider && enabled,
    staleTime: 15_000,
    retry: 1,
  });
}

// ── @canva (direct Canva Connect API designs) ────────────────────────────────
//
// Unlike @connect/@wolke (Nango / Nextcloud), Canva is a direct OAuth
// integration. The picker lists the user's designs live; selecting designs
// inserts a markdown link per design into the composer.

export interface ChatCanvaDesign {
  id: string;
  title: string;
  viewUrl: string;
  editUrl: string;
  thumbnailUrl: string | null;
  updatedAt: number | null;
}

/**
 * The user's Canva designs. Disabled until the picker opens (`enabled`), and
 * re-fetched on open so newly created designs show up. Returns an empty list
 * (not an error) when the user hasn't connected Canva yet — the picker renders
 * an empty-state in that case.
 */
export function useCanvaDesignsQuery(query: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery<{ designs: ChatCanvaDesign[]; connected: boolean }>({
    queryKey: ['mention-canva-designs', query],
    queryFn: async () => {
      try {
        const qs = query ? `?query=${encodeURIComponent(query)}` : '';
        const res = await apiClient.get<{ designs?: ChatCanvaDesign[]; error?: string }>(
          `/api/canva/designs${qs}`
        );
        return { designs: Array.isArray(res?.designs) ? res.designs : [], connected: true };
      } catch {
        // 404 (not connected) or any failure → treat as "not connected" so the
        // picker shows the connect-first empty-state instead of an error.
        return { designs: [], connected: false };
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
    retry: 1,
  });
}

// ── @vorlagen (semantic template search) ─────────────────────────────────────
//
// The @vorlagen picker semantically searches the user's published Vorlagen via
// the backend vector index. Each query embeds the search term and returns the
// best matches; selecting templates inserts a markdown link per template.

export interface ChatVorlageTemplate {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  external_url: string | null;
  score: number;
}

/**
 * Semantic search over published Vorlagen for the @vorlagen picker. Disabled
 * until the picker opens (`enabled`); re-fetched per query term. Returns an
 * empty list (not an error) on any failure so the picker renders an empty-state.
 */
export function useVorlagenSearchQuery(query: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery<{ vorlagen: ChatVorlageTemplate[] }>({
    queryKey: ['mention-vorlagen-search', query],
    queryFn: async () => {
      try {
        const qs = query ? `?query=${encodeURIComponent(query)}` : '';
        const res = await apiClient.get<{ vorlagen?: ChatVorlageTemplate[] }>(
          `/api/vorlagen/search${qs}`
        );
        return { vorlagen: Array.isArray(res?.vorlagen) ? res.vorlagen : [] };
      } catch {
        return { vorlagen: [] };
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
    retry: 1,
  });
}

// ── Admin-curated Rezepte visibility ──────────────────────────────────────────
//
// `mention`s an admin hid from discovery on this deployment
// (admin_hidden_skills). Discovery-only: resolveSkillMention stays
// unfiltered, so an existing @mention/link keeps resolving. Long staleTime
// and an empty-array default — visibility rarely changes and a stale/failed
// fetch must degrade to "show everything", never the reverse.
//
// Also mirrors the result into the module-level `setHiddenSkillMentions`
// (mentionables.ts), same pattern as `setMentionInstance`: the picker's
// synchronous filter functions (getAgentMentionables) can't read a query
// result directly, so the hook pushes it into shared module state as a side
// effect. Components that render a live catalog (Agentura, SkillLibraryModal,
// PlusMenu) read the returned array directly instead.

export function useHiddenSkillMentions(): readonly string[] {
  const apiClient = useApiClient();
  const { data } = useQuery<{ hiddenMentions: string[] }>({
    queryKey: ['admin-hidden-skills'],
    queryFn: () => apiClient.get<{ hiddenMentions: string[] }>('/api/skills/visibility'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const hiddenMentions = data?.hiddenMentions ?? [];
  useEffect(() => {
    setHiddenSkillMentions(hiddenMentions);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- array identity changes every fetch; join() is the stable dependency
  }, [hiddenMentions.join(',')]);
  return hiddenMentions;
}

/**
 * Convenience hook that triggers all dynamic-mentionable queries — call from
 * the chat composer so dynamic mentionables are warm by the time @-popovers
 * open.
 */
export function useMentionablesQuery(): void {
  useCustomAgentsQuery();
  useTextformsQuery();
  useBoardsQuery();
  useDocsQuery();
  useSheetsQuery();
  useUserNotebooksQuery();
  useMcpServersQuery();
  useHiddenSkillMentions();
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
