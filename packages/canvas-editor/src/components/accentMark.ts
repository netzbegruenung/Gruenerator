/**
 * Die tiptap-Mark zu `==Akzent==`. Sie steht in JEDEM Feld im Schema — ein
 * Dokument mit einer unbekannten Mark lässt ProseMirror werfen, und tiptap
 * setzt dann ein leeres Dokument (siehe `markExtension` in `RichTextField`).
 * Ohne eigene Farbe entscheidet der Text, wie der Akzent aussieht
 * (`TextAccent`); im Editor zeigen ihn die CSS-Variablen, die das Overlay setzt.
 * Mit Farbe (`=={#E6007E}…==`) trägt die Mark sie selbst als `--mark-color`.
 */
import { Mark } from '@tiptap/core';

import { colorAttribute } from './markColor';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    accent: {
      toggleAccent: () => ReturnType;
      /** Setzt den Akzent; `null` = Farbe der Vorlage. */
      setAccent: (color: string | null) => ReturnType;
      unsetAccent: () => ReturnType;
    };
  }
}

export const Accent = Mark.create({
  name: 'accent',
  addAttributes: () => ({ color: colorAttribute('--mark-color') }),
  parseHTML: () => [{ tag: 'mark[data-accent]' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', { 'data-accent': '', ...HTMLAttributes }, 0],
  addCommands() {
    return {
      toggleAccent:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      setAccent:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetAccent:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
