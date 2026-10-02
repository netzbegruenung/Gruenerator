import { useEffect, useState } from 'react';

import { iconSetsLoaded, loadIconSetsFor } from '../utils/canvasIcons';
import { selectedCatalogIconIds, type IconIdCarrier } from '../utils/iconInstances';

/**
 * Loads the icon sets a page's icons come from and re-renders once they are
 * in. Without it an icon draws only when its set happens to be loaded — the
 * default set with the sidebar, the others only after an icon search.
 */
export function useIconSetsFor(
  selectedIcons: string[] | undefined,
  iconStates: Record<string, IconIdCarrier> | undefined
): void {
  const ids = selectedCatalogIconIds(selectedIcons, iconStates);
  const key = ids.join('|');
  const [, setLoaded] = useState(0);
  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    if (iconSetsLoaded(wanted)) return;
    let live = true;
    void loadIconSetsFor(wanted).then(() => {
      if (live) setLoaded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [key]);
}
