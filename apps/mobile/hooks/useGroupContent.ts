import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import {
  groupContentKey,
  groupPostFilePath,
  toGroupFeedItems,
  type GroupFeedItem,
  type GroupPostFile,
} from '@gruenerator/shared/groups';
import { getNotebookDefinition } from '@gruenerator/shared/notebooks';
import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';

import { resolveChatUrl } from '../services/chatApiUrl';
import { secureStorage } from '../services/storage';

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

/** Beitragsdateien sind nur für Mitglieder lesbar: Bilder und Downloads brauchen den Bearer. */
export function useBearerToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void secureStorage.getToken().then(setToken);
  }, []);
  return token;
}

export function groupPostFileUrl(groupId: string, postId: string, fileId: string): string {
  return resolveChatUrl(groupPostFilePath(groupId, postId, fileId));
}

/** Datei eines Beitrags laden und an den System-Teilen-Dialog geben (Öffnen, Sichern, Senden). */
export async function shareGroupPostFile(
  groupId: string,
  postId: string,
  file: GroupPostFile
): Promise<void> {
  const token = await secureStorage.getToken();
  if (!token) throw new Error('Nicht angemeldet.');
  const target = new File(Paths.cache, `${file.id}-${file.name.replace(/[/\\]/g, '_')}`);
  const downloaded = await File.downloadFileAsync(
    groupPostFileUrl(groupId, postId, file.id),
    target,
    { headers: { Authorization: `Bearer ${token}` }, idempotent: true }
  );
  await Sharing.shareAsync(downloaded.uri, { mimeType: file.mimeType, dialogTitle: file.name });
}

type Router = ReturnType<typeof useRouter>;

// Every web-viewer call stays a literal `router.push`: the handoff allowlist
// guard (apps/api/plugins/webViewHandoffRedirect.vitest.ts) finds its callers
// by scanning for `pathname: '/(fullscreen)/web-viewer'` plus a literal `path`.
/**
 * Sharepic-Vorlagen haben in der App kein Ziel: „Verwenden" klont sie, und
 * die App ist hier nur zum Lesen. `/projekte/` steht bewusst nicht in der
 * Handoff-Allowlist. Beiträge stehen ganz auf der Karte.
 */
export const canOpenInApp = (item: GroupFeedItem): boolean =>
  item.kind !== 'sharepic-template' && item.kind !== 'post';

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
    case 'post':
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
      // Native chat with the shared agent; for a user agent the slug is its
      // row uuid, for a system agent its identifier.
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
