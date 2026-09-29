import { PillTabs } from '../../../components/common/PillTabs';
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
 * Warum der aktive Reiter nicht auf `bg-primary` liegt, steht an `PillTabs`.
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
    <PillTabs
      ariaLabel="Regale"
      active={active}
      onSelect={onSelect}
      tabs={categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        icon: AGENTURA_CATEGORY_ICONS[cat.key],
      }))}
    />
  );
}
