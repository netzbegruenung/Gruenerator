import type { IconType } from 'react-icons';

export interface AisleNavItem {
  id: string;
  label: string;
  icon: IconType;
  count: number;
}

interface CategoryNavProps {
  items: AisleNavItem[];
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Aisle directory: a sticky vertical list on desktop, a horizontally scrollable
 * pill row on mobile. Clicking an entry scroll-jumps to that section.
 */
export function CategoryNav({ items }: CategoryNavProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Aisles"
      className="flex gap-xs overflow-x-auto pb-xs lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {items.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          type="button"
          onClick={() => jumpTo(id)}
          className="flex shrink-0 items-center gap-xs rounded-full border border-grey-200 px-sm py-1.5 text-sm text-foreground-muted transition-colors hover:bg-hover-alt hover:text-foreground dark:border-grey-700 lg:rounded-md lg:border-0 lg:px-sm lg:py-2 lg:hover:text-secondary-700 lg:dark:hover:text-secondary-300"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap lg:flex-1 lg:text-left">{label}</span>
          <span className="text-xs text-foreground-muted">{count}</span>
        </button>
      ))}
    </nav>
  );
}
