import { cn, Skeleton } from '@gruenerator/ui';

import './dashboardTokens.css';

/** Ein Lade-Platzhalter in der Tönung der Dashboard-Seiten. */
export function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded bg-(--dash-skeleton)', className)} />;
}
