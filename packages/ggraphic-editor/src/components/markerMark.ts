// SPDX-License-Identifier: MPL-2.0
/**
 * Die tiptap-Mark zu `++Marker++` — wie `accentMark.ts` immer im Schema (eine
 * unbekannte Mark lässt ProseMirror werfen und tiptap setzt ein leeres
 * Dokument). Ohne eigene Farbe zeigt der Editor den Kasten über die
 * CSS-Variablen, die das Overlay setzt; mit Farbe (`++{#FFFFFF}…++`) trägt die
 * Mark Kasten- und Schriftfarbe selbst.
 */
import { Mark } from '@tiptap/core';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { colorAttribute } from '@ggraphic/editor/components/markColor';

import { markerInkOn } from '../utils/markerColors.js';

import type { BrandPack } from '@ggraphic/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    marker: {
      toggleMarker: () => ReturnType;
      /** Setzt den Textmarker; `null` = Kastenfarbe der Vorlage. */
      setMarker: (color: string | null) => ReturnType;
      unsetMarker: () => ReturnType;
    };
  }
}

export interface MarkerOptions {
  /**
   * Das Markenpaket des Dokuments: seine dunkle Schrift bekommt ein frei
   * gewählter Kasten, wie auf der Leinwand. `null` = das aktive Paket.
   */
  brand: BrandPack | null;
}

export const Marker = Mark.create<MarkerOptions>({
  name: 'marker',
  addOptions: () => ({ brand: null }),
  addAttributes() {
    const { brand } = this.options;
    return {
      color: colorAttribute(
        '--mark-fill',
        (color) => `--mark-ink:${markerInkOn(color, brand ?? activeBrand())}`
      ),
    };
  },
  parseHTML: () => [{ tag: 'mark[data-marker]' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', { 'data-marker': '', ...HTMLAttributes }, 0],
  addCommands() {
    return {
      toggleMarker:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      setMarker:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetMarker:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
