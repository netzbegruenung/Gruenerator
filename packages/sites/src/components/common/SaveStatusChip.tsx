import { cn } from '@gruenerator/shared/utils';

import { type SaveStatus } from '../../draft/useSiteDraftSession';

// Nothing to say once saved; the region stays mounted so a later status is announced.
const LABELS: Record<Exclude<SaveStatus, 'saved'>, string> = {
  saving: 'Wird gespeichert …',
  offline: 'Offline – Änderungen bleiben auf diesem Gerät',
};

export function SaveStatusChip({ status }: { status: SaveStatus }) {
  if (status === 'saved') return <span role="status" />;
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
