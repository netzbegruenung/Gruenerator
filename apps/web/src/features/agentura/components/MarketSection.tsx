import { SectionHeader } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import { type GridSize } from '@/components/common/Gallery/parts';

/**
 * Feste Spaltenzahl statt `GalleryGrid`s Mindestbreite: Marktkacheln tragen
 * Titel, Meta-Zeile und Beschreibung, und die Umschaltung soll auf dem Desktop
 * genau zwischen 4 (klein) und 3 (groß) Spalten wechseln. Die Seiten starten
 * auf groß, also mit 3 Spalten.
 */
const GRID_CLASS: Record<GridSize, string> = {
  small: 'grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  large: 'grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3',
};

/**
 * Ein Abschnitt im Raster — mit derselben Überschrift wie auf `/wissen`, damit
 * Übersicht, Agentura und Notebooks gleich lesen. `aside` steht rechts neben der
 * Überschrift; die Seiten setzen dort beim ersten Abschnitt die Kachelgröße.
 */
export function MarketSection({
  title,
  gridSize,
  aside,
  children,
}: {
  title: string;
  gridSize: GridSize;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <SectionHeader title={title} actions={aside} />
      <div className={GRID_CLASS[gridSize]}>{children}</div>
    </section>
  );
}
