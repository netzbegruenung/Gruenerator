/**
 * Die tiptap-Mark zu `==Akzent==`. Sie steht in JEDEM Feld im Schema — ein
 * Dokument mit einer unbekannten Mark lässt ProseMirror werfen, und tiptap
 * setzt dann ein leeres Dokument (siehe `markExtension` in `RichTextField`).
 * Wie der Akzent aussieht, entscheidet der Text (`TextAccent`); im Editor
 * zeigen ihn die CSS-Variablen, die das Overlay setzt.
 */
import { Mark } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    accent: {
      toggleAccent: () => ReturnType;
    };
  }
}

export const Accent = Mark.create({
  name: 'accent',
  parseHTML: () => [{ tag: 'mark[data-accent]' }],
  renderHTML: () => ['mark', { 'data-accent': '' }, 0],
  addCommands() {
    return {
      toggleAccent:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});
