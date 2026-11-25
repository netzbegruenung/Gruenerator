import { type ContentSyncRun, type ContentSyncRunFilter } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const RUNS_KEY = ['admin-content-sync-runs'] as const;
const SETTINGS_KEY = ['admin-content-sync-settings'] as const;

export function useContentSyncRuns(filter: ContentSyncRunFilter) {
  return useQuery<ContentSyncRun[]>({
    queryKey: [...RUNS_KEY, filter],
    queryFn: async () => {
      const result = await getContractsClient().adminContentSync.listRuns({ query: { filter } });
      if (result.status !== 200) throw new Error('Sync-Läufe konnten nicht geladen werden.');
      return result.body.runs;
    },
    staleTime: 30_000,
  });
}

export function useContentSyncSettings() {
  return useQuery<boolean>({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const result = await getContractsClient().adminContentSync.getSettings();
      if (result.status !== 200) throw new Error('Einstellungen konnten nicht geladen werden.');
      return result.body.emailEnabled;
    },
  });
}

export function useSetContentSyncEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (emailEnabled: boolean) => {
      const result = await getContractsClient().adminContentSync.updateSettings({
        body: { emailEnabled },
      });
      if (result.status !== 200) throw new Error('Einstellung konnte nicht gespeichert werden.');
      return result.body.emailEnabled;
    },
    onSuccess: (emailEnabled) => qc.setQueryData(SETTINGS_KEY, emailEnabled),
  });
}
