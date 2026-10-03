/**
 * Die tiptap-Mark zu `++Marker++` — wie `accentMark.ts` immer im Schema (eine
 * unbekannte Mark lässt ProseMirror werfen und tiptap setzt ein leeres
 * Dokument), angeboten nur, wo der Text einen Markerstil trägt (`TextMarker`).
 * Der Editor zeigt den Kasten über die CSS-Variablen, die das Overlay setzt.
 */
import { Mark } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    marker: {
      toggleMarker: () => ReturnType;
    };
  }
}

export const Marker = Mark.create({
  name: 'marker',
  parseHTML: () => [{ tag: 'mark[data-marker]' }],
  renderHTML: () => ['mark', { 'data-marker': '' }, 0],
  addCommands() {
    return {
      toggleMarker:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});
