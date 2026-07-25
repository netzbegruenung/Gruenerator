import React from 'react';

import manifestJson from '@site/src/generated/agentura.json';

import styles from './styles.module.css';

interface Category {
  key: string;
  label: string;
  description?: string;
}
interface Manifest {
  categories: Category[];
  defaultCategory: string;
  sortLabels: Record<string, string>;
  recipeCategories: Record<string, string>;
}

const manifest = manifestJson as Manifest;

/**
 * The market's shelves, straight from the app's own category catalog.
 *
 * Unlike ToolOverview and OfficeOps there is no hand-written half here: the
 * source already carries a `label` and a `description` written for the screen,
 * so re-phrasing them in the article would just create a second copy that rots.
 * Consequently there is no audit either — `agentura:check` keeps the manifest
 * fresh and that is the whole contract.
 */
export default function AgenturaShelves(): React.JSX.Element {
  return (
    <div className={styles.grid}>
      {manifest.categories.map((category) => (
        <div key={category.key} className={styles.shelf}>
          <h4 className={styles.shelfTitle}>
            {category.label}
            {category.key === manifest.defaultCategory && (
              <span className={styles.badge}>Startansicht</span>
            )}
          </h4>
          {category.description && <p className={styles.description}>{category.description}</p>}
        </div>
      ))}
    </div>
  );
}

/** The recipe sections inside the official shelf. */
export function RecipeCategories(): React.JSX.Element {
  return <>{Object.values(manifest.recipeCategories).join(', ')}</>;
}

/** The sort options offered in the market header. */
export function SortOptions(): React.JSX.Element {
  return <>{Object.values(manifest.sortLabels).join(' und ')}</>;
}

/** How many shelves the market has. */
export function ShelfCount(): React.JSX.Element {
  return <>{manifest.categories.length}</>;
}
