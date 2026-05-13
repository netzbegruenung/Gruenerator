import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import type { DocumentStatusValue } from '@gruenerator/contracts';

export type DocumentStatusMap = Record<string, DocumentStatusValue>;

const TERMINAL: ReadonlySet<DocumentStatusValue> = new Set(['completed', 'failed']);

const allTerminal = (ids: string[], statuses: DocumentStatusMap): boolean =>
  ids.length > 0 && ids.every((id) => TERMINAL.has(statuses[id] ?? 'pending'));

/**
 * Poll the status of one or more uploaded documents at a fixed interval.
 *
 * Stops polling automatically when every requested ID has reached a terminal
 * state (`completed` or `failed`). Unknown IDs (e.g. not yet visible to the
 * caller's user_id) are treated as `pending` and will keep polling.
 */
export function useDocumentStatusPolling(
  ids: string[],
  options: { enabled?: boolean; intervalMs?: number } = {}
): { statuses: DocumentStatusMap; allDone: boolean } {
  const { enabled = true, intervalMs = 1000 } = options;

  const query = useQuery({
    queryKey: ['documentStatuses', [...ids].sort()],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<DocumentStatusMap> => {
      const client = getContractsClient();
      const result = await client.documents.getDocumentStatuses({ body: { ids } });
      if (result.status !== 200) return {};
      const map: DocumentStatusMap = {};
      for (const row of result.body.statuses) {
        map[row.id] = row.status;
      }
      return map;
    },
    refetchInterval: (q) => {
      const data = q.state.data as DocumentStatusMap | undefined;
      if (!data) return intervalMs;
      return allTerminal(ids, data) ? false : intervalMs;
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  });

  const statuses = query.data ?? {};
  return { statuses, allDone: allTerminal(ids, statuses) };
}
