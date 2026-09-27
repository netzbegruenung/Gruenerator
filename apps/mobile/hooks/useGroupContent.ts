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

const web = (router: Router, path: string, title: string) =>
  router.push({ pathname: '/(fullscreen)/web-viewer', params: { path, title } });

export function openGroupFeedItem(router: Router, item: GroupFeedItem, groupId: string): void {
  switch (item.kind) {
    case 'doc':
      router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } });
      return;
    case 'board':
      web(router, `/boards/${item.id}`, item.title);
      return;
    case 'sharepic':
      web(router, `/studio/canvas/${item.id}`, item.title);
      return;
    case 'sharepic-template':
      // „Verwenden" klont die Vorlage — das kann nur die Web-Fläche des Projekts.
      web(router, `/projekte/${groupId}`, item.title);
      return;
    case 'generator':
      web(router, `/gruenerator/${item.slug ?? item.id}`, item.title);
      return;
    case 'notebook':
      // `/notebooks/`, not the singular `/notebook/`: the latter is a legacy
      // route that redirects client-side, and the WebView pins its policy to
      // the path it was opened with — the redirect would be blocked.
      web(router, `/notebooks/${item.id}`, item.title);
      return;
    case 'agent':
      // Native chat with the shared agent; the slug is the agent identifier.
      router.push({
        pathname: '/(focused)/chat-conversation',
        params: { threadId: 'new', agentId: item.slug ?? item.id },
      });
      return;
    case 'text':
      web(router, `/texte/${item.id}`, item.title);
      return;
    case 'template':
      web(router, `/datenbank/vorlagen?selected=${item.id}`, item.title);
      return;
    case 'document':
      web(router, `/documents/${item.id}`, item.title);
      return;
  }
}
