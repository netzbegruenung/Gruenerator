import { cn } from '../../../../utils/cn';

import type { SourceStatus } from './hubSources';

const TONE: Record<SourceStatus, string> = {
  ready: 'bg-secondary-600',
  indexing: 'bg-amber-500',
  failed: 'bg-red-600',
};

/** Farbe ist nie allein Träger: jede Stelle zeigt den Status auch als Text. */
export function StatusDot({ status }: { status: SourceStatus }) {
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE[status])} />;
}
