/**
 * Die tiptap-Mark zu `++Marker++` — wie `accentMark.ts` immer im Schema (eine
 * unbekannte Mark lässt ProseMirror werfen und tiptap setzt ein leeres
 * Dokument). Ohne eigene Farbe zeigt der Editor den Kasten über die
 * CSS-Variablen, die das Overlay setzt; mit Farbe (`++{#FFFFFF}…++`) trägt die
 * Mark Kasten- und Schriftfarbe selbst.
 */
import { Mark } from '@tiptap/core';

import { markerInkOn } from '../utils/markerColors';

import { colorAttribute } from './markColor';

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

export const Marker = Mark.create({
  name: 'marker',
  addAttributes: () => ({
    color: colorAttribute('--mark-fill', (color) => `--mark-ink:${markerInkOn(color)}`),
  }),
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
