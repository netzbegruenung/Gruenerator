import { cn } from '@gruenerator/ui';

import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

export interface PillTab<K extends string> {
  key: K;
  label: string;
  icon?: IconType;
  /** Kleiner Zusatz hinter dem Label, z. B. ein „Beta"-Hinweis. */
  suffix?: ReactNode;
}

/**
 * Große Pill-Reiter (Agentura-Regale, Notebook-Quellen).
 *
 * Der aktive Reiter liegt auf `secondary-600`, NICHT auf `bg-primary`. Grund
 * ist die Doppelrolle von `--color-primary`: hell löst es auf `primary-600`
 * auf (weiß darauf 7,24:1), dunkel aber auf `primary-500` — und dort erreicht
 * weiße Schrift nur 3,73:1. `--color-secondary` ist in beiden Modi
 * `#587C6D` (4,65:1) und ist dieselbe Paarung, die `Button variant="brand"`
 * trägt. Siehe den Kommentar an `--color-primary-val` in `variables.css`.
 */
export function PillTabs<K extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  className,
}: {
  tabs: ReadonlyArray<PillTab<K>>;
  active: K | null;
  onSelect: (key: K) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap justify-center gap-sm max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto',
        className
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-xs rounded-full border-[1.5px] px-lg text-[15px] font-semibold transition-colors',
              isActive
                ? 'border-secondary-600 bg-secondary-600 text-white'
                : 'border-transparent bg-primary-50 text-primary-800 hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-100 dark:hover:bg-primary-900'
            )}
          >
            {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
            {tab.label}
            {tab.suffix}
          </button>
        );
      })}
    </div>
  );
}
