import { cn } from '@gruenerator/shared/utils';

import { type SaveStatus } from '../../draft/useSiteDraftSession';

const LABELS: Record<SaveStatus, string> = {
  saved: 'Gespeichert',
  saving: 'Wird gespeichert …',
  offline: 'Offline – Änderungen bleiben auf diesem Gerät',
};

export function SaveStatusChip({ status }: { status: SaveStatus }) {
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center rounded-full border px-sm py-xs text-xs',
        status === 'offline'
          ? 'border-grey-400 text-foreground'
          : 'border-grey-200 text-grey-600 dark:border-grey-700 dark:text-grey-400'
      )}
    >
      {LABELS[status]}
    </span>
  );
}
