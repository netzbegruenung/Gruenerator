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
  setMcpServerMentionables,
  setSheetMentionables,
  setTextforms,
  setUserNotebookMentionables,
  type CustomAgentMentionable,
  type Mentionable,
  type TextformMentionable,
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

interface TextFormListItem {
  kind: 'preset' | 'custom';
  mention: string;
  title: string;
}

/**
 * User's custom text forms ("Texte anlernen") → per-form `/mention` skills.
 * Presets ride the existing system-skill mentions, so only custom forms surface
 * here. Anonymous users / no forms resolve to an empty list.
 */
export function useTextformsQuery() {
  const apiClient = useApiClient();
  return useQuery<TextformMentionable[]>({
    queryKey: ['mention-textforms'],
    queryFn: async () => {
      const res = await apiClient
        .get<{ forms?: TextFormListItem[] }>('/api/text-forms')
        .catch(() => ({ forms: [] }));
      const list = Array.isArray(res?.forms)
        ? res.forms
            .filter((f) => f.kind === 'custom')
            .map((f) => ({ mention: f.mention, title: f.title }))
        : [];
      setTextforms(list);
      return list;
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

export function useSheetsQuery() {
  const apiClient = useApiClient();
  return useQuery<DocListItem[]>({
    queryKey: ['mention-sheets'],
    queryFn: async () => {
      const docs = await apiClient.get<DocListItem[]>('/api/docs');
      const list = Array.isArray(docs) ? docs.filter((d) => d.document_subtype === 'sheets') : [];
      setSheetMentionables(list.map((d) => ({ id: d.id, title: d.title, slug: slugify(d.title) })));
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
      // Boards and sheets are separate mention kinds with their own context loaders.
      const list = Array.isArray(docs)
        ? docs.filter((d) => d.document_subtype !== 'boards' && d.document_subtype !== 'sheets')
        : [];
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

interface McpServerListItem {
  id: string;
  name: string;
  enabled: boolean;
  description?: string | null;
}

/**
 * User's connected external MCP servers → per-server @mentions (@notion,
 * @brevo, …). Only enabled servers become mentions; anonymous users / no
 * servers resolve to an empty list.
 */
export function useMcpServersQuery() {
  const apiClient = useApiClient();
  return useQuery<McpServerListItem[]>({
    queryKey: ['mention-mcp-servers'],
    queryFn: async () => {
      const res = await apiClient
        .get<{ servers?: McpServerListItem[] }>('/api/mcp/servers')
        .catch(() => ({ servers: [] }));
      const list = Array.isArray(res?.servers) ? res.servers.filter((s) => s.enabled) : [];
      setMcpServerMentionables(
        list.map((s) => ({ id: s.id, name: s.name, description: s.description }))
      );
      return list;
    },
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
