// SPDX-License-Identifier: MPL-2.0
/**
 * Die tiptap-Mark zu `++Marker++` — wie `accentMark.ts` immer im Schema (eine
 * unbekannte Mark lässt ProseMirror werfen und tiptap setzt ein leeres
 * Dokument). Ohne eigene Farbe zeigt der Editor den Kasten über die
 * CSS-Variablen, die das Overlay setzt; mit Farbe (`++{#FFFFFF}…++`) trägt die
 * Mark Kasten- und Schriftfarbe selbst.
 */
import { type BrandPack } from '@ggraphic/core';
import { Mark } from '@tiptap/core';

import { colorAttribute } from '@ggraphic/editor/components/markColor';

import { markerInkOn } from '../utils/markerColors.js';

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
  /** Das Paket des Dokuments, dessen dunkle Schrift auf frei gewählten Kästen steht; null = das aktive. */
  brand: BrandPack | null;
}

export const Marker = Mark.create<MarkerOptions>({
  name: 'marker',
  addOptions: () => ({ brand: null }),
  addAttributes() {
    const brand = this.options.brand ?? undefined;
    return {
      color: colorAttribute('--mark-fill', (color) => `--mark-ink:${markerInkOn(color, brand)}`),
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
