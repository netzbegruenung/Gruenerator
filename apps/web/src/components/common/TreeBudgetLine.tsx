import { type TreeBudgetStatus } from '@gruenerator/contracts';

import { cn } from '@/utils/cn';

const NF_TREES = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Formats a (possibly fractional) Bäume amount, e.g. `2.5` → `"2,5"`. */
export function formatTrees(n: number): string {
  return NF_TREES.format(n);
}

export interface TreeBudgetLineProps {
  status: TreeBudgetStatus;
  className?: string;
}

/** "Heute noch 7,5 von 15 Bäumen." — the per-user daily Bäume budget. */
export function TreeBudgetLine({ status, className }: TreeBudgetLineProps) {
  const text =
    status.limit === null
      ? 'Unbegrenzt auf dieser Instanz.'
      : status.remaining === 1
        ? `Heute noch 1 Baum von ${formatTrees(status.limit)}.`
        : `Heute noch ${formatTrees(status.remaining ?? Math.max(status.limit - status.used, 0))} von ${formatTrees(status.limit)} Bäumen.`;

  return <p className={cn('m-0 text-xs text-grey-500', className)}>{text}</p>;
}
