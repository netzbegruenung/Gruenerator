import { twMerge } from 'tailwind-merge';
import { describe, expect, it } from 'vitest';

import { composerActiveChipClass, composerToolbarButtonClass } from './utils';

/**
 * Der aktive Chip darf keine Eigenschaft zweimal setzen.
 *
 * Der erste Anlauf setzte ihn auf `composerToolbarButtonClass` auf und
 * überschrieb dessen `px-2` mit `pl-2.5 pr-3`. Das überlebt auch
 * tailwind-merge: `px` verdrängt `pl`/`pr`, nicht umgekehrt — beide Klassen
 * bleiben stehen, und welche gewinnt, entscheidet dann die Reihenfolge im
 * erzeugten Stylesheet, nicht der Aufruf. Die Polsterung des Entwurfs wäre
 * still verpufft.
 */
describe('composerActiveChipClass', () => {
  for (const isCompact of [false, true]) {
    const name = isCompact ? 'kompakt' : 'normal';

    it(`setzt keine Klasse doppelt (${name})`, () => {
      const classes = composerActiveChipClass(isCompact).split(' ');
      expect(new Set(classes).size).toBe(classes.length);
    });

    it(`überlebt tailwind-merge unverändert (${name})`, () => {
      const cls = composerActiveChipClass(isCompact);
      expect(twMerge(cls)).toBe(cls);
    });

    it(`erbt die Polsterung des Toolbar-Knopfs nicht (${name})`, () => {
      // `px-*` vom Knopf würde `pl-*`/`pr-*` des Chips aushebeln.
      expect(composerActiveChipClass(isCompact)).not.toMatch(/\bpx-/);
    });
  }

  it('lässt den Toolbar-Knopf unangetastet', () => {
    // Der Chip teilt nur die Grundform mit ihm; alle anderen Aufrufer des
    // Knopfs dürfen sich nicht mitverändern.
    expect(composerToolbarButtonClass()).toContain('rounded-lg');
    expect(composerToolbarButtonClass()).toContain('px-2');
    expect(composerActiveChipClass()).toContain('rounded-full');
  });
});
