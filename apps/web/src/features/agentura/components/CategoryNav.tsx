import { type AgenturaCategoryKey } from '../lib/categories';

import type { IconType } from 'react-icons';

export interface AisleNavItem {
  key: AgenturaCategoryKey;
  label: string;
  icon: IconType;
  count: number;
}

interface CategoryNavProps {
  items: AisleNavItem[];
  /** `null` while a search is active — no row is highlighted. */
  activeKey: AgenturaCategoryKey | null;
  onSelect: (key: AgenturaCategoryKey) => void;
}

/**
 * Category directory: a sticky vertical selector on desktop, a horizontally
 * scrollable pill row on mobile. Clicking an entry makes it the active category —
 * the main pane then shows only that category's items.
 */
export function CategoryNav({ items, activeKey, onSelect }: CategoryNavProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Kategorien" className="lg:sticky lg:top-24">
      <div className="mb-sm hidden px-sm text-xs font-bold uppercase tracking-wide text-foreground-muted lg:block">
        Kategorien
      </div>
      <div className="flex gap-xs overflow-x-auto pb-xs lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {items.map(({ key, label, icon: Icon, count }) => {
          const active = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(key)}
              className={`flex shrink-0 items-center gap-sm rounded-full border px-sm py-1.5 text-sm transition-colors lg:w-full lg:rounded-md lg:border-0 lg:px-sm lg:py-1.5 ${
                active
                  ? 'border-secondary-600/30 bg-secondary-600/10 text-primary-700 dark:text-primary-300 lg:bg-hover-alt'
                  : 'border-grey-200 text-foreground-muted hover:bg-hover-alt hover:text-foreground dark:border-grey-700 lg:border-0'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  active
                    ? 'bg-secondary-600/20 text-secondary-700 dark:text-secondary-300'
                    : 'bg-hover-alt text-foreground-muted dark:bg-grey-800'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className={`whitespace-nowrap lg:flex-1 lg:overflow-hidden lg:text-ellipsis lg:text-left ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                {label}
              </span>
              <span
                className={`text-xs font-semibold ${active ? 'text-secondary-600' : 'text-foreground-muted'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
