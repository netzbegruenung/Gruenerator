import {
  syncBoards,
  syncCustomAgents,
  syncDocs,
  syncMcpServers,
  syncSheets,
  syncTextforms,
  syncUserNotebooks,
  type MentionableFetch,
} from '@gruenerator/chat';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useAuth } from '@gruenerator/shared/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Mobile counterpart to web's `useMentionablesQuery`.
 *
 * `filterMentionables` reads module-level lists that something has to fill from
 * the API. Web does that in its own hook; before this, mobile did not do it at
 * all, so `@` only ever offered the statically defined recipes, tools and
 * notebooks — boards, docs, sheets, the user's own notebooks and connected MCP
 * servers were silently missing, in the chat thread included.
 *
 * The endpoint→store mapping itself lives in `@gruenerator/chat`
 * (`lib/mentionableSync`), shared with web: the `@slug` a title becomes is the
 * key a typed mention resolves against, so the two platforms must derive it
 * identically. This hook only supplies mobile's HTTP client and React Query.
 */

const STALE_TIME = 60_000;

/** The sync layer's `get` contract, backed by mobile's shared axios client. */
function useMentionableFetch(): MentionableFetch {
  return useMemo(
    () =>
      async <T>(path: string): Promise<T> => {
        const res = await getGlobalApiClient().get<T>(path);
        return res.data;
      },
    []
  );
}

/**
 * Warms every dynamic mentionable list. Mounted by `Composer`, mirroring web,
 * so the data is ready by the time an `@` popover opens; React Query
 * deduplicates across the several composers a screen may hold.
 *
 * Gated on an authenticated session: every endpoint here is behind auth, and
 * firing them on the login screen would only produce 401 noise.
 */
export function useMentionablesSync(): void {
  const get = useMentionableFetch();
  const { isAuthenticated } = useAuth();

  const common = { staleTime: STALE_TIME, retry: 1, enabled: isAuthenticated } as const;

  useQuery({
    queryKey: ['mention-custom-agents'],
    queryFn: () => syncCustomAgents(get),
    ...common,
  });
  useQuery({ queryKey: ['mention-textforms'], queryFn: () => syncTextforms(get), ...common });
  useQuery({ queryKey: ['mention-boards'], queryFn: () => syncBoards(get), ...common });
  useQuery({ queryKey: ['mention-docs'], queryFn: () => syncDocs(get), ...common });
  useQuery({ queryKey: ['mention-sheets'], queryFn: () => syncSheets(get), ...common });
  useQuery({
    queryKey: ['mention-user-notebooks'],
    queryFn: () => syncUserNotebooks(get),
    ...common,
  });
  useQuery({ queryKey: ['mention-mcp-servers'], queryFn: () => syncMcpServers(get), ...common });
}
