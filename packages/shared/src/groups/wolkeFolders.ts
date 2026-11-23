/**
 * Wolke-Ordner als Projektwissen (#5945, experimentell). Lesen alle
 * Mitglieder, anhängen, abgleichen und trennen nur Projekt-Admins (der Server
 * prüft). Jede Änderung frischt auch die Projektinhalte auf — die Dateien des
 * Ordners stehen dort im Wissen.
 */
import { type GroupWolkeFolder, type GroupWolkeFolderSyncResponse } from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

import { groupContentKey } from './types.js';

export const groupWolkeFoldersKey = (id: string) => ['groupWolkeFolders', id] as const;

export const useGroupWolkeFolders = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupWolkeFoldersKey(groupId ?? ''),
    queryFn: async (): Promise<GroupWolkeFolder[]> => {
      const res = await getContractsClient().groups.listGroupWolkeFolders({
        params: { groupId: groupId ?? '' },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Wolke-Ordner konnten nicht geladen werden.');
      return res.body.folders;
    },
    enabled: !!groupId,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

function useRefresh(groupId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: groupWolkeFoldersKey(groupId) });
    void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
  };
}

export const useAttachGroupWolkeFolder = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (body: {
      url: string;
      includeSubfolders: boolean;
      name?: string;
    }): Promise<GroupWolkeFolderSyncResponse> => {
      const res = await getContractsClient().groups.attachGroupWolkeFolder({
        params: { groupId },
        body,
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Der Wolke-Ordner ließ sich nicht anhängen.');
      return res.body;
    },
    onSettled: refresh,
  });
};

export const useSyncGroupWolkeFolder = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (folderId: string): Promise<GroupWolkeFolderSyncResponse> => {
      const res = await getContractsClient().groups.syncGroupWolkeFolder({
        params: { groupId, folderId },
      });
      if (res.status !== 200) throw apiErrorFromResponse(res, 'Der Abgleich ist fehlgeschlagen.');
      return res.body;
    },
    onSettled: refresh,
  });
};

export const useDetachGroupWolkeFolder = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (folderId: string): Promise<void> => {
      const res = await getContractsClient().groups.detachGroupWolkeFolder({
        params: { groupId, folderId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Der Ordner ließ sich nicht trennen.');
    },
    onSettled: refresh,
  });
};

/** Eine Zeile Rückmeldung nach einem Abgleich. */
export function wolkeSyncSummaryText(s: GroupWolkeFolderSyncResponse['summary']): string {
  const parts: string[] = [];
  if (s.imported > 0) parts.push(`${s.imported} eingelesen`);
  if (s.removed > 0) parts.push(`${s.removed} entfernt`);
  if (s.pending > 0) parts.push(`${s.pending} folgen beim nächsten Abgleich`);
  if (s.skipped > 0) parts.push(`${s.skipped} übersprungen`);
  if (s.failed > 0) parts.push(`${s.failed} nicht lesbar`);
  return parts.join(' · ') || 'Alles aktuell.';
}
