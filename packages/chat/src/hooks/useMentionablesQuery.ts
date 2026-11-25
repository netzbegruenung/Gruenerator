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

import {
  driveBrowseResponseSchema,
  driveProviderSchema,
  googlePickerConfigResponseSchema,
  type DriveProvider,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import { ApiError } from '@gruenerator/shared/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { createChatApiClient } from '../context/ChatContext';
import { formatFileSize } from '../lib/fileUtils';
import { pickGoogleFiles, type PickedGoogleFile } from '../lib/googlePicker';
import { setHiddenAgentIdentifiers } from '../lib/hiddenAgentsState';
import {
  setHiddenSkillMentions,
  type Mentionable,
  type CustomAgentMentionable,
  type TextformMentionable,
  type UserAgentMentionable,
} from '../lib/mentionables';
import {
  slugifyMention as slugify,
  syncBoards,
  syncCustomAgents,
  syncDocs,
  syncMcpServers,
  syncSheets,
  syncTextforms,
  syncUserAgents,
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

/**
 * `mention-docs` and `mention-sheets` read the same `GET /api/docs` list and only
 * differ in their filter, so both queries ride one request: `fetchQuery` joins a
 * fetch that is already in flight (default `staleTime` 0 keeps later refetches,
 * e.g. after a trash invalidation, fresh).
 */
function useSharedDocsListFetch(): MentionableFetch {
  const get = useMentionableFetch();
  const queryClient = useQueryClient();
  return useMemo(
    () =>
      <T>(path: string) =>
        path === '/api/docs'
          ? (queryClient.fetchQuery({
              queryKey: ['mention-docs-source'],
              queryFn: () => get<T>(path),
            }) as Promise<T>)
          : get<T>(path),
    [get, queryClient]
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
 * Grünerator-Agenten (`user_agents`): the user's own plus every agent shared
 * into one of their groups, the latter carrying their group of origin.
 */
export function useUserAgentsQuery() {
  const get = useMentionableFetch();
  return useQuery<UserAgentMentionable[]>({
    queryKey: ['mention-user-agents'],
    queryFn: () => syncUserAgents(get),
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
  const get = useSharedDocsListFetch();
  return useQuery<DocListItem[]>({
    queryKey: ['mention-sheets'],
    queryFn: () => syncSheets(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useDocsQuery() {
  const get = useSharedDocsListFetch();
  return useQuery<DocListItem[]>({
    queryKey: ['mention-docs'],
    queryFn: () => syncDocs(get),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useUserNotebooksQuery() {
  const fetchViaHost = useChatConfigStore((s) => s.fetchUserNotebooks);
  const plainGet = useMentionableFetch();
  // With a host-supplied list the endpoint is read through the host's cache; the
  // sync layer keeps its 401 → empty handling and registry feed unchanged.
  const get = useMemo<MentionableFetch>(
    () =>
      fetchViaHost
        ? <T>() => fetchViaHost().then((collections) => ({ collections }) as T)
        : plainGet,
    [fetchViaHost, plainGet]
  );
  return useQuery<UserNotebookListItem[]>({
    queryKey: ['mention-user-notebooks'],
    queryFn: () => syncUserNotebooks(get, plainGet),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/**
 * User's connected external MCP servers → per-server @mentions (@notion,
 * @brevo, …). Only enabled servers become mentions; anonymous users / no
 * servers resolve to an empty list.
 */
/**
 * Query key of the @mention server list. Exported so the connector settings can
 * invalidate it after adding, removing or switching a server: the settings are a
 * dialog over the chat, so the composer stays mounted and would otherwise keep
 * the old list until it remounts after `STALE_TIME`.
 */
export const MCP_SERVER_MENTIONS_QUERY_KEY = ['mention-mcp-servers'] as const;

export function useMcpServersQuery() {
  const get = useMentionableFetch();
  return useQuery<McpServerListItem[]>({
    queryKey: MCP_SERVER_MENTIONS_QUERY_KEY,
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
  isSupported?: boolean;
  sizeFormatted?: string;
}

/** Providers with a folder view; the others (Jira, Confluence) have none. */
export function isDriveProvider(provider: string): provider is DriveProvider {
  return driveProviderSchema.safeParse(provider).success;
}

/**
 * The user's Nango connection status, filtered to connected drives (the only
 * providers with a folder view). Used by the @connect picker to render the provider list and an empty-state when the
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
      return (res?.providers ?? []).filter((p) => p.connected && isDriveProvider(p.provider));
    },
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
    retry: 1,
  });
}

/**
 * Every connected Nango provider key, not just the drives — the document menu
 * needs it for the Teams/Slack send targets. Fetched on open for the
 * same reason as {@link useConnectProvidersQuery}.
 */
export function useConnectedProvidersQuery(enabled = true) {
  const apiClient = useApiClient();
  return useQuery<string[]>({
    queryKey: ['connected-providers'],
    queryFn: async () => {
      const res = await apiClient.get<{ providers?: ChatConnectProvider[] }>(
        '/api/connections/status'
      );
      return (res?.providers ?? []).filter((p) => p.connected).map((p) => p.provider);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
    retry: 1,
  });
}

/**
 * One folder of a connected drive (OneDrive, Google Drive), already in one
 * shape for both providers (`/api/connections/:provider/browse`). Jira and
 * Confluence have no folder view. A 403 means the grant expired: the picker
 * offers to reconnect instead of showing a generic error.
 */
export function useConnectBrowseQuery(
  provider: string | null,
  folderId: string | null,
  enabled = true,
  /** Suche beim Anbieter (Postfächer). */
  search: string | null = null
) {
  const apiClient = useApiClient();
  return useQuery<ChatConnectFile[]>({
    queryKey: ['mention-connect-browse', provider, folderId, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      if (search) params.set('q', search);
      const qs = params.size > 0 ? `?${params.toString()}` : '';
      const res = driveBrowseResponseSchema.parse(
        await apiClient.get<unknown>(`/api/connections/${provider}/browse${qs}`)
      );
      return res.entries.map((e) => ({
        id: e.id,
        name: e.name,
        isDirectory: e.isFolder,
        isSupported: e.isSupported,
        ...(e.mimeType ? { mimeType: e.mimeType } : {}),
        ...(e.size !== null ? { sizeFormatted: formatFileSize(e.size) } : {}),
      }));
    },
    enabled: !!provider && isDriveProvider(provider) && enabled,
    staleTime: 15_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 1,
  });
}

/**
 * Opens the Google Picker with the user's own token. Google Drive runs under
 * the `drive.file` scope: the app only sees files picked here, so Google has
 * no folder listing in the cloud browser. Resolves to `[]` on cancel; a 403
 * (`ApiError`) means the grant expired, a 404 that the picker key is missing.
 */
export function useOpenGooglePicker(): () => Promise<PickedGoogleFile[]> {
  const apiClient = useApiClient();
  return async () => {
    const config = googlePickerConfigResponseSchema.parse(
      await apiClient.get<unknown>('/api/connections/google/picker')
    );
    return pickGoogleFiles(config);
  };
}

// ── @vorlage (Sharepic-Vorlagen catalogue) ───────────────────────────────────
//
// The @vorlage picker lists the Grünerator Sharepic-Vorlagen catalogue (already
// filtered to the viewer's country by the server). The list is small and
// rarely changes, so it is cached and filtered client-side.

/**
 * Catalogue for the @vorlage picker. Disabled until the picker opens
 * (`enabled`); errors surface so the picker can show its error state.
 */
export function useSharepicVorlagenQuery(enabled = true) {
  const apiClient = useApiClient();
  return useQuery<SharepicVorlage[]>({
    queryKey: ['mention-sharepic-vorlagen'],
    queryFn: async () => {
      const res = await apiClient.get<{ vorlagen?: SharepicVorlage[] }>('/api/sharepic-vorlagen');
      return Array.isArray(res?.vorlagen) ? res.vorlagen : [];
    },
    staleTime: 5 * 60 * 1000,
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

/**
 * Dasselbe für Agenten. Eigener Endpunkt statt eines gemeinsamen, weil die
 * beiden Listen verschiedene Schlüssel tragen (Rezept-`mention` gegen
 * Agenten-`identifier`) und getrennt ungültig werden.
 *
 * Fällt der Abruf aus, bleibt die Liste leer und alles sichtbar — ein
 * Netzwerkfehler darf den Katalog nicht leeren.
 */
export function useHiddenAgentIdentifiers(enabled = true): readonly string[] {
  const apiClient = useApiClient();
  const { data } = useQuery<{ hiddenIdentifiers: string[] }>({
    queryKey: ['admin-hidden-agents'],
    queryFn: () => apiClient.get<{ hiddenIdentifiers: string[] }>('/api/agents/visibility'),
    staleTime: 5 * 60_000,
    retry: 1,
    enabled,
  });
  const hiddenIdentifiers = data?.hiddenIdentifiers ?? [];
  useEffect(() => {
    setHiddenAgentIdentifiers(hiddenIdentifiers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- array identity changes every fetch; join() is the stable dependency
  }, [hiddenIdentifiers.join(',')]);
  return hiddenIdentifiers;
}

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
  useUserAgentsQuery();
  useTextformsQuery();
  useBoardsQuery();
  useDocsQuery();
  useSheetsQuery();
  useUserNotebooksQuery();
  useMcpServersQuery();
  useHiddenSkillMentions();
  useHiddenAgentIdentifiers();
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
