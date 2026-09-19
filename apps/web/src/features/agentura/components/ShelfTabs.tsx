import { cn } from '@gruenerator/ui';

import {
  AGENTURA_CATEGORY_ICONS,
  type AgenturaCategory,
  type AgenturaCategoryKey,
} from '../lib/categories';

/**
 * Die Regal-Reiter des Marktes.
 *
 * Grün statt des gelben Werkzeugfeldes, das die Agentura sonst trägt: die
 * Reiter sind die eine Entscheidung, die diese Seite verlangt, und sie stehen
 * über einem Raster aus bewusst grauen Kacheln. Hier soll der Akzent hin.
 *
 * Der aktive Reiter liegt auf `secondary-600`, NICHT auf `bg-primary`. Grund
 * ist die Doppelrolle von `--color-primary`: hell löst es auf `primary-600`
 * auf (weiß darauf 7,24:1), dunkel aber auf `primary-500` — und dort erreicht
 * weiße Schrift nur 3,73:1. `--color-secondary` ist in beiden Modi
 * `#587C6D` (4,65:1) und ist dieselbe Paarung, die `Button variant="brand"`
 * trägt. Siehe den Kommentar an `--color-primary-val` in `variables.css`.
 */
export function ShelfTabs({
  categories,
  active,
  onSelect,
}: {
  categories: AgenturaCategory[];
  active: AgenturaCategoryKey | null;
  onSelect: (key: AgenturaCategoryKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Regale"
      className="flex flex-wrap justify-center gap-sm max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto"
    >
      {categories.map((cat) => {
        const Icon = AGENTURA_CATEGORY_ICONS[cat.key];
        const isActive = cat.key === active;
        return (
          <button
            key={cat.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(cat.key)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-xs rounded-full border-[1.5px] px-lg text-[15px] font-semibold transition-colors',
              isActive
                ? 'border-secondary-600 bg-secondary-600 text-white'
                : 'border-transparent bg-primary-50 text-primary-800 hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-100 dark:hover:bg-primary-900'
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
