import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { groupContentKey, toGroupFeedItems, type GroupFeedItem } from '@gruenerator/shared/groups';
import { getNotebookDefinition } from '@gruenerator/shared/notebooks';
import { useQuery } from '@tanstack/react-query';

import type { useRouter } from 'expo-router';

/** Alles, was mit dem Projekt geteilt ist — flach und angeheftet zuerst, wie im Web. */
export function useGroupFeed(groupId: string | null | undefined) {
  return useQuery({
    queryKey: groupContentKey(groupId ?? ''),
    queryFn: async (): Promise<GroupFeedItem[]> => {
      const res = await getContractsClient().groups.listGroupContent({
        params: { groupId: groupId ?? '' },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Inhalte konnten nicht geladen werden.');
      return toGroupFeedItems(res.body.content, {
        systemNotebookTitle: (id) => getNotebookDefinition(id)?.title ?? null,
      });
    },
    enabled: !!groupId,
    staleTime: 30_000,
  });
}

type Router = ReturnType<typeof useRouter>;

// Every web-viewer call stays a literal `router.push`: the handoff allowlist
// guard (apps/api/plugins/webViewHandoffRedirect.vitest.ts) finds its callers
// by scanning for `pathname: '/(fullscreen)/web-viewer'` plus a literal `path`.
/**
 * Sharepic-Vorlagen haben in der App kein Ziel: „Verwenden" klont sie, und
 * die App ist hier nur zum Lesen. `/projekte/` steht bewusst nicht in der
 * Handoff-Allowlist.
 */
export const canOpenInApp = (item: GroupFeedItem): boolean => item.kind !== 'sharepic-template';

export function openGroupFeedItem(router: Router, item: GroupFeedItem): void {
  switch (item.kind) {
    case 'doc':
      router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } });
      return;
    case 'board':
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/boards/${item.id}`, title: item.title },
      });
      return;
    case 'sharepic':
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/studio/canvas/${item.id}`, title: item.title },
      });
      return;
    case 'sharepic-template':
      return;
    case 'generator':
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/gruenerator/${item.slug ?? item.id}`, title: item.title },
      });
      return;
    case 'notebook':
      // `/notebooks/`, not the singular `/notebook/`: the latter is a legacy
      // route that redirects client-side, and the WebView pins its policy to
      // the path it was opened with — the redirect would be blocked.
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/notebooks/${item.id}`, title: item.title },
      });
      return;
    case 'agent':
      // Native chat with the shared agent; the slug is the agent identifier.
      router.push({
        pathname: '/(focused)/chat-conversation',
        params: { threadId: 'new', agentId: item.slug ?? item.id },
      });
      return;
    case 'text':
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/texte/${item.id}`, title: item.title },
      });
      return;
    case 'template':
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/datenbank/vorlagen?selected=${item.id}`, title: item.title },
      });
      return;
    case 'document':
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/documents/${item.id}`, title: item.title },
      });
      return;
  }
}
