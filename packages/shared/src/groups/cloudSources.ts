/**
 * Synchronisierte Ablagen als Projektwissen (#5945, experimentell): Wolke-Ordner
 * und Google-Drive-Auswahlen. Lesen alle Mitglieder, anhängen, abgleichen und
 * trennen nur Projekt-Admins (der Server prüft). Jede Änderung frischt auch die
 * Projektinhalte auf — die Dateien stehen dort im Wissen.
 */
import {
  type AttachGroupDriveFilesBody,
  type AttachGroupWolkeFolderBody,
  type GroupCloudSource,
  type GroupCloudSourceSyncResponse,
} from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

import { groupContentKey } from './types.js';

export const groupCloudSourcesKey = (id: string) => ['groupCloudSources', id] as const;

export const useGroupCloudSources = (groupId: string | null | undefined) =>
  useQuery({
    queryKey: groupCloudSourcesKey(groupId ?? ''),
    queryFn: async (): Promise<GroupCloudSource[]> => {
      const res = await getContractsClient().groups.listGroupCloudSources({
        params: { groupId: groupId ?? '' },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Verbundene Ablagen konnten nicht geladen werden.');
      return res.body.sources;
    },
    enabled: !!groupId,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

function useRefresh(groupId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: groupCloudSourcesKey(groupId) });
    void qc.invalidateQueries({ queryKey: groupContentKey(groupId) });
  };
}

export const useAttachGroupWolkeFolder = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (body: AttachGroupWolkeFolderBody): Promise<GroupCloudSourceSyncResponse> => {
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

export const useAttachGroupDriveFiles = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (body: AttachGroupDriveFilesBody): Promise<GroupCloudSourceSyncResponse> => {
      const res = await getContractsClient().groups.attachGroupDriveFiles({
        params: { groupId },
        body,
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Die Drive-Dateien ließen sich nicht hinzufügen.');
      return res.body;
    },
    onSettled: refresh,
  });
};

export const useSyncGroupCloudSource = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (sourceId: string): Promise<GroupCloudSourceSyncResponse> => {
      const res = await getContractsClient().groups.syncGroupCloudSource({
        params: { groupId, sourceId },
      });
      if (res.status !== 200) throw apiErrorFromResponse(res, 'Der Abgleich ist fehlgeschlagen.');
      return res.body;
    },
    onSettled: refresh,
  });
};

export const useDetachGroupCloudSource = (groupId: string) => {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (sourceId: string): Promise<void> => {
      const res = await getContractsClient().groups.detachGroupCloudSource({
        params: { groupId, sourceId },
      });
      if (res.status !== 200)
        throw apiErrorFromResponse(res, 'Die Quelle ließ sich nicht trennen.');
    },
    onSettled: refresh,
  });
};

/** Eine Zeile Rückmeldung nach einem Abgleich. */
export function cloudSyncSummaryText(s: GroupCloudSourceSyncResponse['summary']): string {
  const parts: string[] = [];
  if (s.imported > 0) parts.push(`${s.imported} eingelesen`);
  if (s.removed > 0) parts.push(`${s.removed} entfernt`);
  if (s.pending > 0) parts.push(`${s.pending} folgen beim nächsten Abgleich`);
  if (s.skipped > 0) parts.push(`${s.skipped} übersprungen`);
  if (s.failed > 0) parts.push(`${s.failed} nicht lesbar`);
  return parts.join(' · ') || 'Alles aktuell.';
}

/** Statuszeile unter einer Quelle: Fehler, sonst Dateien · ausstehend · letzter Abgleich. */
export function cloudSourceStatusParts(
  source: GroupCloudSource,
  relativeTime: (iso: string) => string
): string {
  if (source.lastError) return source.lastError;
  return [
    `${source.fileCount} ${source.fileCount === 1 ? 'Datei' : 'Dateien'}`,
    source.pendingCount > 0 ? `${source.pendingCount} folgen` : null,
    source.lastSyncedAt
      ? `abgeglichen ${relativeTime(source.lastSyncedAt)}`
      : 'noch nicht abgeglichen',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Bestätigungstext für „Trennen". */
export function detachCloudSourceDescription(source: GroupCloudSource): string {
  const where = source.provider === 'wolke' ? 'In der Wolke' : 'In Google Drive';
  if (source.fileCount === 0) {
    return `Die Quelle wird nicht mehr abgeglichen. ${where} bleibt alles, wie es ist.`;
  }
  const files =
    source.fileCount === 1 ? 'Die Datei verlässt' : `Die ${source.fileCount} Dateien verlassen`;
  return `${files} das Projekt. ${where} bleibt alles, wie es ist.`;
}
