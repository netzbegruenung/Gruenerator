import { PiStack } from 'react-icons/pi';

import type { SidebarTab } from '../../sidebar/types';

/**
 * „Ebenen": jedes Element der aktiven Seite als Liste (`LayersSection`), der
 * Weg zu allem auf der Fläche für Tastatur und Screenreader (#4953). Wie die
 * Vorlagen hängt der Editor den Bereich selbst an, statt dass jede Config ihn
 * führt: die Liste füllt sich aus dem Bericht der aktiven Seite (Zeichenfolge
 * und Auswahl), nicht aus `state`/`actions` einer Section. Aus
 * `configs/commonSections.ts` käme mit dem Reiter jede Section in den
 * Editor-Chunk, die die Configs sonst erst beim Laden nachziehen.
 */
export const layersTab: SidebarTab = {
  id: 'layers',
  icon: PiStack,
  label: 'Ebenen',
  ariaLabel: 'Ebenen: alle Elemente der Seite',
};

/** Als letzter Bereich: mobil der sechste Platz der festen Leiste. */
export function withLayersTab(tabs: readonly SidebarTab[]): SidebarTab[] {
  return [...tabs, layersTab];
}
