import { cn } from '@gruenerator/ui';

import type { ReactNode } from 'react';

interface PillButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Smaller padding for secondary toggles (e.g. map view). */
  size?: 'md' | 'sm';
}

/**
 * A single segmented-control pill. Active = the surface's accent: magenta on the
 * dashboard pages (`--dash-mg`), forest green elsewhere (Transparenz).
 */
export function PillButton({ active, onClick, children, size = 'md' }: PillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border-none font-bold transition-colors',
        size === 'md' ? 'px-[18px] py-2 text-[0.9rem]' : 'px-3.5 py-1.5 text-[0.8rem]',
        active
          ? 'bg-[var(--dash-mg,#316049)] text-[var(--dash-on-mg,#fff)] shadow-sm'
          : 'bg-transparent text-[#3a4a42] hover:text-[var(--dash-mg,#316049)] dark:text-grey-300 dark:hover:text-white'
      )}
    >
      {children}
    </button>
  );
}
