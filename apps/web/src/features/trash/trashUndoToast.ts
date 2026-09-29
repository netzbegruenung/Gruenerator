import { type TrashKind } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { invalidateAfterTrashChange } from './invalidateAfterTrashChange';
import { TRASH_KIND_LABELS } from './trashKinds';
import { toastRestoreError, trashError } from './useTrash';

/** `id` is the handle the trash API addresses — for `shared_media` the share token. */
export interface TrashedItem {
  kind: TrashKind;
  id: string;
  title?: string | null;
}

interface TrashUndoOptions {
  onRestored?: () => void;
}

function trashedMessage(item: TrashedItem): string {
  const title = item.title?.trim();
  return title
    ? `„${title}“ wurde in den Papierkorb verschoben.`
    : `${TRASH_KIND_LABELS[item.kind]} wurde in den Papierkorb verschoben.`;
}

async function restore(qc: QueryClient, item: TrashedItem, opts: TrashUndoOptions | undefined) {
  try {
    const res = await getContractsClient().trash.restore({
      params: { kind: item.kind, id: item.id },
    });
    if (res.status !== 200) throw trashError(res);
    invalidateAfterTrashChange(qc, item.kind);
    opts?.onRestored?.();
    toast.success('Wiederhergestellt.');
  } catch (err) {
    toastRestoreError(err);
  }
}

/** Call after a successful DELETE: the item sits in the trash, the toast offers the way back. */
export function showTrashUndoToast(
  qc: QueryClient,
  item: TrashedItem,
  opts?: TrashUndoOptions
): void {
  toast(trashedMessage(item), {
    id: `trash:${item.kind}:${item.id}`,
    duration: 8000,
    action: {
      label: 'Rückgängig',
      // sonner ignores a returned promise, so the handler stays synchronous.
      onClick: () => {
        void restore(qc, item, opts);
      },
    },
  });
}

export function useTrashUndoToast(): (item: TrashedItem, opts?: TrashUndoOptions) => void {
  const qc = useQueryClient();
  return useCallback((item, opts) => showTrashUndoToast(qc, item, opts), [qc]);
}
