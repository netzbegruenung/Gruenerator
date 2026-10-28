// SPDX-License-Identifier: MPL-2.0
import { cn } from '@ggraphic/editor/utils/cn';
import { memo, type CSSProperties, type ReactNode } from 'react';

const FAN =
  'transition-transform duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none';

/**
 * A category as a card stack: two cards behind the front one fan out on hover
 * while the cover tilts. Transform and opacity only — the deeper shadow is an
 * `::after` that fades in, not an animated `box-shadow`.
 */
export const CategoryCard = memo(function CategoryCard({
  label,
  countLabel,
  tint,
  cover,
  enterIndex,
  onOpen,
}: {
  label: string;
  countLabel: string | null;
  tint: 'primary' | 'secondary';
  cover: ReactNode;
  enterIndex: number | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group/cat flex flex-col items-center gap-2.5 min-w-0 p-0 bg-transparent border-none cursor-pointer rounded-2xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--editor-surface)]',
        enterIndex !== null && 'element-enter [--enter-from:translateY(18px)]'
      )}
      {...(enterIndex !== null
        ? { style: { '--i': Math.min(enterIndex, 7) } as CSSProperties }
        : {})}
    >
      <span className="relative block w-full aspect-square">
        <span
          aria-hidden
          className={cn(
            'absolute inset-2 rounded-[14px] bg-[var(--editor-stack-back)] [transform:rotate(-4deg)]',
            'group-hover/cat:[transform:rotate(-13deg)_translate(-10px,2px)] group-focus-visible/cat:[transform:rotate(-13deg)_translate(-10px,2px)]',
            FAN
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute inset-2 rounded-[14px] bg-[var(--editor-stack-mid)] [transform:rotate(5deg)]',
            'group-hover/cat:[transform:rotate(13deg)_translate(10px,2px)] group-focus-visible/cat:[transform:rotate(13deg)_translate(10px,2px)]',
            FAN
          )}
        />
        <span
          className={cn(
            'absolute inset-1 rounded-[14px] bg-[var(--editor-surface)] grid place-items-center shadow-sm',
            "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:shadow-lg after:opacity-0",
            'after:transition-opacity after:duration-[400ms] group-hover/cat:after:opacity-100',
            'group-hover/cat:[transform:translateY(-5px)_scale(1.03)] group-focus-visible/cat:[transform:translateY(-5px)_scale(1.03)]',
            FAN
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 rounded-[inherit]',
              tint === 'primary' ? 'bg-[var(--editor-active-soft)]' : 'bg-[var(--editor-tile)]'
            )}
          />
          <span
            aria-hidden
            className={cn(
              'relative grid place-items-center size-14',
              'transition-transform duration-500 ease-[cubic-bezier(.3,1.5,.5,1)] motion-reduce:transition-none',
              'group-hover/cat:[transform:scale(1.12)_rotate(-6deg)]'
            )}
          >
            {cover}
          </span>
        </span>
      </span>
      <span className="flex flex-col items-center gap-px min-w-0 max-w-full">
        <span className="text-sm font-semibold text-[var(--editor-text)] truncate max-w-full transition-colors duration-200 group-hover/cat:text-[var(--editor-active-fg)]">
          {label}
        </span>
        {countLabel && (
          <span className="text-[11px] text-[var(--editor-text-muted)]">{countLabel}</span>
        )}
      </span>
    </button>
  );
});
