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
  balken: ['settings', 'text'],
  chart: ['chart-settings', 'elements', 'assets'],
  'pill-badge': ['elements', 'assets'],
  'circle-badge': ['elements', 'assets'],
};

/** The visible area tab a mobile selection belongs to, or null if none fits. */
export function getMobileSelectionArea(
  type: SelectionType | null | undefined,
  visibleTabIds: readonly SidebarTabId[]
): SidebarTabId | null {
  if (!type) return null;
  return AREA_CANDIDATES[type].find((id) => visibleTabIds.includes(id)) ?? null;
}
