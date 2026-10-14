import {
  type AdminReportAction,
  type AdminReportGroup,
  type ContentReportStatus,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const REPORTS_KEY = ['admin-reports'] as const;
const STATS_KEY = ['admin-reports-stats'] as const;

export function useAdminReports(status: ContentReportStatus) {
  return useQuery<AdminReportGroup[]>({
    queryKey: [...REPORTS_KEY, status],
    queryFn: async () => {
      const result = await getContractsClient().adminReports.list({ query: { status } });
      if (result.status !== 200) throw new Error('Meldungen konnten nicht geladen werden.');
      return result.body.reports;
    },
    staleTime: 30_000,
  });
}

export function useAdminReportStats() {
  return useQuery<number>({
    queryKey: STATS_KEY,
    queryFn: async () => {
      const result = await getContractsClient().adminReports.stats();
      if (result.status !== 200) throw new Error('Statistik konnte nicht geladen werden.');
      return result.body.open;
    },
    staleTime: 30_000,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      kind: AdminReportGroup['kind'];
      targetId: string;
      action: AdminReportAction;
    }) => {
      const result = await getContractsClient().adminReports.resolve({ body: vars });
      if (result.status !== 200) throw new Error('Aktion fehlgeschlagen.');
      return result.body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REPORTS_KEY });
      void qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}
