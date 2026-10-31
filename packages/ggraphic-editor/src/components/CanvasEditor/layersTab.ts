// SPDX-License-Identifier: MPL-2.0
import { PiStack } from 'react-icons/pi';

import { messages } from '@ggraphic/editor/i18n/messages';

import type { SidebarTab } from '../../sidebar/types.js';

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
  // Lazily, so the language registered later still applies.
  get label() {
    return messages().sidebar.layers.title;
  },
  get ariaLabel() {
    return messages().sidebar.layers.tabAriaLabel;
  },
};

/** Als letzter Bereich: mobil der sechste Platz der festen Leiste. */
export function withLayersTab(tabs: readonly SidebarTab[]): SidebarTab[] {
  return [...tabs, layersTab];
}
