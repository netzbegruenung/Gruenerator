import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

import type {
  DocumentStatusValue,
  DocumentProcessingStage,
  DocumentProcessingProgress,
} from '@gruenerator/contracts';

export type DocumentStatusMap = Record<string, DocumentStatusValue>;
export type DocumentStageMap = Record<string, DocumentProcessingStage | null>;
export type DocumentProgressMap = Record<string, DocumentProcessingProgress | null>;

interface PollResult {
  statuses: DocumentStatusMap;
  stages: DocumentStageMap;
  progresses: DocumentProgressMap;
}

const TERMINAL: ReadonlySet<DocumentStatusValue> = new Set(['completed', 'failed']);

const allTerminal = (ids: string[], statuses: DocumentStatusMap): boolean =>
  ids.length > 0 && ids.every((id) => TERMINAL.has(statuses[id] ?? 'pending'));

/**
 * Poll the status of one or more uploaded documents at a fixed interval.
 *
 * Stops polling automatically when every requested ID has reached a terminal
 * state (`completed` or `failed`). Unknown IDs (e.g. not yet visible to the
 * caller's user_id) are treated as `pending` and will keep polling.
 *
 * Returns per-document stage label ("extracting" / "chunking" / "upserting")
 * and per-batch progress (during the "upserting" tail) so callers can render
 * granular per-doc progress instead of a single generic spinner.
 */
export function useDocumentStatusPolling(
  ids: string[],
  options: { enabled?: boolean; intervalMs?: number } = {}
): {
  statuses: DocumentStatusMap;
  stages: DocumentStageMap;
  progresses: DocumentProgressMap;
  allDone: boolean;
} {
  const { enabled = true, intervalMs = 1000 } = options;

  const query = useQuery({
    queryKey: ['documentStatuses', [...ids].sort()],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<PollResult> => {
      const client = getContractsClient();
      const result = await client.documents.getDocumentStatuses({ body: { ids } });
      if (result.status !== 200) {
        return { statuses: {}, stages: {}, progresses: {} };
      }
      const statuses: DocumentStatusMap = {};
      const stages: DocumentStageMap = {};
      const progresses: DocumentProgressMap = {};
      for (const row of result.body.statuses) {
        statuses[row.id] = row.status;
        stages[row.id] = row.stage ?? null;
        progresses[row.id] = row.progress ?? null;
      }
      return { statuses, stages, progresses };
    },
    refetchInterval: (q) => {
      const data = q.state.data as PollResult | undefined;
      if (!data) return intervalMs;
      return allTerminal(ids, data.statuses) ? false : intervalMs;
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  });

  const data = query.data ?? { statuses: {}, stages: {}, progresses: {} };
  return {
    statuses: data.statuses,
    stages: data.stages,
    progresses: data.progresses,
    allDone: allTerminal(ids, data.statuses),
  };
}
