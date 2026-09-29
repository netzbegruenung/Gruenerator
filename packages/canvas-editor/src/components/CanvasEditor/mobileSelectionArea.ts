import type { FloatingModuleState } from '../../hooks/useFloatingModuleState';
import type { SidebarTabId } from '../../sidebar/types';

type SelectionType = FloatingModuleState['type'];

// Auswahl = Bereich: welches Sheet ein angetipptes Element öffnet. Mehrere
// Kandidaten, weil ältere Vorlagen ihre Bereiche noch unter Legacy-IDs führen
// (`assets` statt `elements`, `image-background` statt `background`).
const AREA_CANDIDATES: Record<SelectionType, readonly SidebarTabId[]> = {
  text: ['text'],
  shape: ['elements', 'assets'],
  icon: ['elements', 'assets'],
  illustration: ['elements', 'assets'],
  asset: ['elements', 'assets'],
  frame: ['elements', 'assets'],
  background: ['background', 'image-background', 'image'],
  image: ['image', 'background', 'image-background', 'uploads'],
  'user-image': ['uploads', 'image'],
  balken: ['text'],
};

/**
 * The tab a mobile selection opens: the config's detail tab for it (the one
 * desktop auto-switches to, often hidden from the tab strip — e.g. `settings`
 * for a balken) or else the visible area tab it belongs to; null if none fits.
 */
export function getMobileSelectionArea(
  type: SelectionType | null | undefined,
  visibleTabIds: readonly SidebarTabId[],
  detailTab: SidebarTabId | null = null
): SidebarTabId | null {
  if (!type) return null;
  return detailTab ?? AREA_CANDIDATES[type].find((id) => visibleTabIds.includes(id)) ?? null;
}
