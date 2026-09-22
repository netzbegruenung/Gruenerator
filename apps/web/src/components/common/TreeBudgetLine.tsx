import { type TreeBudgetStatus } from '@gruenerator/contracts';
import { LiteTooltip } from '@gruenerator/ui';
import { PiLeaf } from 'react-icons/pi';

import { cn } from '@/utils/cn';

const NF_TREES = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Formats a (possibly fractional) Bäume amount, e.g. `2.5` → `"2,5"`. */
export function formatTrees(n: number): string {
  return NF_TREES.format(n);
}

function remainingOf(status: TreeBudgetStatus): number {
  return status.remaining ?? Math.max((status.limit ?? 0) - status.used, 0);
}

/** "Heute noch 7,5 von 15 Bäumen." — the one sentence both shapes below say. */
export function treeBudgetSentence(status: TreeBudgetStatus): string {
  if (status.limit === null) return 'Unbegrenzt auf dieser Instanz.';
  if (status.remaining === 1) return `Heute noch 1 Baum von ${formatTrees(status.limit)}.`;
  return `Heute noch ${formatTrees(remainingOf(status))} von ${formatTrees(status.limit)} Bäumen.`;
}

export interface TreeBudgetLineProps {
  status: TreeBudgetStatus;
  className?: string;
}

/** The budget as a full sentence, for footers with room for it. */
export function TreeBudgetLine({ status, className }: TreeBudgetLineProps) {
  return <p className={cn('m-0 text-xs text-grey-500', className)}>{treeBudgetSentence(status)}</p>;
}

export interface TreeBudgetChipProps {
  status: TreeBudgetStatus;
  /** Appended to the tooltip, e.g. what one Baum buys in this feature. */
  hint?: string;
  className?: string;
}

/**
 * Below this many Bäume left the chip shows up; above it, it stays away. At 10
 * Bäume a day and ~0,01 for a short text the remaining count is almost always
 * beside the point, and a number nobody needs still takes the eye every time.
 * The full balance is in Einstellungen → Bäume either way.
 */
export const TREE_CHIP_THRESHOLD = 5;

/**
 * The budget as a leaf and a number, for crowded toolbars — and only while it
 * is worth a glance, see `TREE_CHIP_THRESHOLD`.
 *
 * `LiteTooltip` opens on hover only — no focus, no touch, and its text is not
 * wired to the chip. So the sentence also rides along visually hidden: without
 * it the budget would exist for mouse users alone.
 */
export function TreeBudgetChip({ status, hint, className }: TreeBudgetChipProps) {
  // An unlimited instance has no balance to run down, so there is never
  // anything to warn about.
  if (status.limit === null) return null;
  if (remainingOf(status) >= TREE_CHIP_THRESHOLD) return null;

  const sentence = treeBudgetSentence(status);
  return (
    <LiteTooltip label={hint ? `${sentence} ${hint}` : sentence} side="top">
      <span
        className={cn(
          'inline-flex h-9 cursor-default items-center gap-xxs rounded-full px-xs text-xs font-semibold text-primary-600',
          className
        )}
      >
        <PiLeaf aria-hidden="true" className="text-base" />
        <span aria-hidden="true">{formatTrees(remainingOf(status))}</span>
        <span className="sr-only">{sentence}</span>
      </span>
    </LiteTooltip>
  );
}
