import { CardGrid } from '@gruenerator/ui';
import { useState, type ReactNode } from 'react';

import type { IconType } from 'react-icons';

const INITIAL_VISIBLE = 6;

interface SectionIntroProps {
  /** DOM id used by the aisle nav to scroll-jump to this section. */
  id?: string;
  icon?: IconType;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** An "aisle sign": small icon in a sand badge + section title, with optional blurb/actions. */
export function SectionIntro({ id, icon: Icon, title, description, actions }: SectionIntroProps) {
  return (
    <div id={id} className="mb-md scroll-mt-24">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex items-center gap-sm min-w-0">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-hover-alt text-secondary-700 dark:bg-grey-800 dark:text-secondary-300">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="m-0 truncate text-lg font-semibold text-foreground-heading">{title}</h2>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {description && <p className="m-0 mt-xs text-sm text-foreground-muted">{description}</p>}
    </div>
  );
}

/**
 * Card grid capped at {@link INITIAL_VISIBLE}, with a "show more" toggle. Each
 * instance owns its expanded state, so every aisle collapses independently.
 */
export function CollapsibleGrid({ items }: { items: ReactNode[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  return (
    <>
      <CardGrid columns="auto" gap="md">
        {visible}
      </CardGrid>
      {items.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-sm cursor-pointer border-none bg-transparent text-sm text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
        >
          {showAll ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}
        </button>
      )}
    </>
  );
}
