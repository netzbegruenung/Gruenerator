import type { FloatingModuleState } from '../../hooks/useFloatingModuleState';
import type { SidebarTabId } from '../../sidebar/types';

type SelectionType = FloatingModuleState['type'];

// Nur Bereiche, die das angetippte Objekt selbst zeigen. Text, Formen, Icons,
// Grafiken und Uploads fehlen bewusst: ihre Tabs sind Kataloge zum Hinzufügen
// und kennen die Auswahl nicht. Mehrere Kandidaten, weil ältere Vorlagen ihre
// Bereiche unter Legacy-IDs führen (`assets`, `image-background`).
const AREA_CANDIDATES: Partial<Record<SelectionType, readonly SidebarTabId[]>> = {
  background: ['background', 'image-background', 'image'],
  image: ['image', 'background', 'image-background'],
  illustration: ['elements', 'assets'],
  frame: ['elements', 'assets'],
  chart: ['chart-settings'],
};

/**
 * Where the mobile "Mehr" button leads for the current selection, or null if no
 * tab has anything about this object. The config's `getAutoSwitchTab` target —
 * what desktop opens — wins, even for tabs `getVisibleTabs` hides.
 */
export function getMobileSelectionArea(
  selectedId: string | null,
  module: FloatingModuleState | null,
  visibleTabIds: readonly SidebarTabId[],
  configTarget: SidebarTabId | null
): SidebarTabId | null {
  if (!selectedId) return null;
  if (configTarget) return configTarget;
  if (!module) return null;
  // Eine Vorlagen-Deko (Anführungszeichen, Sonnenblume, Logo) ist kein Foto.
  if (module.type === 'image' && !module.data.isPhoto) return null;
  return AREA_CANDIDATES[module.type]?.find((id) => visibleTabIds.includes(id)) ?? null;
}
