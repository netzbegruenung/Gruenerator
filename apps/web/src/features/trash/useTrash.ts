import { type TrashItem, type TrashKind, type TrashListResponse } from '@gruenerator/contracts';
import { ApiError, getContractsClient, isApiErrorWithStatus } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { toastApiError } from '../../components/utils/toastError';

import { invalidateAfterTrashChange } from './invalidateAfterTrashChange';

type TrashPages = InfiniteData<TrashListResponse, string | null>;

const TRASH_ROOT = ['trash'] as const;

export const trashKey = (kind: TrashKind | null) => ['trash', kind ?? 'all'] as const;

/** The trash answers errors as `{ error }`; keep status and wording together. */
export function trashError(res: { status: number; body: unknown }): ApiError {
  const body = res.body as { error?: unknown } | null;
  const message = typeof body?.error === 'string' ? body.error : 'Aktion fehlgeschlagen.';
  return new ApiError(res.status, message);
}

export function toastRestoreError(err: unknown): void {
  // A 409 is no fault: a live item took the name meanwhile, and the server
  // says which. The generic dictionary has no 409 entry and would both
  // hide that sentence and report the conflict to Sentry as unclassified.
  if (isApiErrorWithStatus(err, 409) && err instanceof Error) {
    toast.error('Wiederherstellen nicht möglich', { description: err.message });
    return;
  }
  toastApiError(err, { source: 'mutation' });
}

export function useTrashList(kind: TrashKind | null) {
  return useInfiniteQuery({
    queryKey: trashKey(kind),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await getContractsClient().trash.list({
        query: {
          ...(kind ? { kind } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: 50,
        },
      });
      if (res.status !== 200) throw trashError(res);
      return res.body;
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

type Snapshot = Array<[QueryKey, TrashPages | undefined]>;

/** Optimistically drop matching items from every cached trash list; returns the rollback. */
async function removeFromLists(
  qc: QueryClient,
  keep: (item: TrashItem) => boolean
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: TRASH_ROOT });
  const previous = qc.getQueriesData<TrashPages>({ queryKey: TRASH_ROOT });
  qc.setQueriesData<TrashPages>({ queryKey: TRASH_ROOT }, (old) =>
    old
      ? { ...old, pages: old.pages.map((page) => ({ ...page, items: page.items.filter(keep) })) }
      : old
  );
  return previous;
}

function rollback(qc: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

const sameItem = (a: TrashItem, b: TrashItem) => a.kind === b.kind && a.id === b.id;

export function useRestoreTrashItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TrashItem) => {
      const res = await getContractsClient().trash.restore({
        params: { kind: item.kind, id: item.id },
      });
      if (res.status !== 200) throw trashError(res);
      return res.body;
    },
    onMutate: async (item) => ({
      snapshot: await removeFromLists(qc, (other) => !sameItem(other, item)),
    }),
    onError: (err, _item, context) => {
      rollback(qc, context?.snapshot);
      toastRestoreError(err);
    },
    onSuccess: (_restored, item) => invalidateAfterTrashChange(qc, item.kind),
    onSettled: () => void qc.invalidateQueries({ queryKey: TRASH_ROOT }),
  });
}

export function usePurgeTrashItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TrashItem) => {
      const res = await getContractsClient().trash.purge({
        params: { kind: item.kind, id: item.id },
      });
      if (res.status !== 200) throw trashError(res);
      return res.body;
    },
    onMutate: async (item) => ({
      snapshot: await removeFromLists(qc, (other) => !sameItem(other, item)),
    }),
    onError: (err, _item, context) => {
      rollback(qc, context?.snapshot);
      toastApiError(err, { source: 'mutation' });
    },
    onSuccess: (_purged, item) => invalidateAfterTrashChange(qc, item.kind),
    onSettled: () => void qc.invalidateQueries({ queryKey: TRASH_ROOT }),
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().trash.empty({ query: {} });
      if (res.status !== 200) throw trashError(res);
      return res.body;
    },
    onMutate: async () => ({ snapshot: await removeFromLists(qc, () => false) }),
    onError: (err, _vars, context) => {
      rollback(qc, context?.snapshot);
      toastApiError(err, { source: 'mutation' });
    },
    onSuccess: () => invalidateAfterTrashChange(qc, null),
    onSettled: () => void qc.invalidateQueries({ queryKey: TRASH_ROOT }),
  });
}
