import { type NotebookOverviewResponse } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';

export type NotebookOverview = NotebookOverviewResponse;

/** As long as the server keeps its copy — anything older it has recomputed since. */
const PERSIST_TTL_MS = 12 * 60 * 60 * 1000;
const storageKey = (collectionId: string) => `gruenerator_notebook_overview:v1:${collectionId}`;

/**
 * The last overview this browser saw, so a reload paints the page at once
 * instead of skeletons. System-notebook statistics only — no personal data.
 */
function readPersisted(collectionId: string): { data: NotebookOverview; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(collectionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { timestamp?: number; data?: NotebookOverview };
    if (!parsed.timestamp || !parsed.data) return null;
    const ageMs = Date.now() - parsed.timestamp;
    // A negative age is a backward clock jump; such an entry would never expire.
    return ageMs >= 0 && ageMs < PERSIST_TTL_MS
      ? { data: parsed.data, timestamp: parsed.timestamp }
      : null;
  } catch {
    return null;
  }
}

function writePersisted(collectionId: string, data: NotebookOverview) {
  try {
    localStorage.setItem(storageKey(collectionId), JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // Storage full or blocked — the in-memory cache still works.
  }
}

async function fetchOverview(collectionId: string): Promise<NotebookOverview> {
  const result = await getContractsClient().notebook.getCollectionOverview({
    params: { id: collectionId },
    query: { refresh: null },
  });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to load notebook overview (HTTP ${result.status})`);
  }
  writePersisted(collectionId, result.body);
  return result.body;
}

const overviewQuery = (collectionId: string) =>
  queryOptions({
    queryKey: ['notebook-overview', collectionId],
    queryFn: () => fetchOverview(collectionId),
    // Seeded with its real age, so `staleTime` decides as if it never left
    // memory: under an hour old it stands, older it refetches in the background.
    initialData: () => readPersisted(collectionId)?.data,
    initialDataUpdatedAt: () => readPersisted(collectionId)?.timestamp,
    // The server caches for 12 h; this only spares refetches on tab switches.
    staleTime: 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
  });

/** Warm the Übersicht tab while the chat tab is open, so switching shows data. */
export function prefetchNotebookOverview(queryClient: QueryClient, collectionId: string) {
  return queryClient.prefetchQuery({ ...overviewQuery(collectionId), meta: { silent: true } });
}

export function useNotebookOverview(collectionId: string) {
  return useQuery(overviewQuery(collectionId));
}
