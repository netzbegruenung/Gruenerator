import { describe, it, expect } from 'vitest';

import { styledFontSpecs } from '../useFontLoader';

/**
 * Der Fehler, gegen den diese Tests stehen, war ein Spec-String OHNE Stil:
 * `${fontSize}px ${family}`. `document.fonts.load` löst das auf 400/normal auf
 * und lädt Fett und Kursiv nie — beides sind eigene `@font-face`-Blöcke. Ein
 * Canvas-Paint fordert keine Schrift an, also blieben sie ungeladen, und ein
 * fetter Lauf wurde gegen den synthetisch gefetteten Regular vermessen.
 */
describe('styledFontSpecs', () => {
  it('nennt den Stil im Spec — sonst lädt nur der Grundschnitt', () => {
    expect(styledFontSpecs('PT Sans', 60)).toEqual(['bold 60px PT Sans', 'italic 60px PT Sans']);
  });

  it('deckt jede Familie ab, die die Vorlage zeichnet', () => {
    expect(styledFontSpecs(['PT Sans', 'GrueneTypeNeue'], 42)).toEqual([
      'bold 42px PT Sans',
      'italic 42px PT Sans',
      'bold 42px GrueneTypeNeue',
      'italic 42px GrueneTypeNeue',
    ]);
  });

  it('fragt kein `bold italic` an', () => {
    // Keine unserer Schriften hat den Schnitt, und Browser und Skia lösen die
    // Anfrage gegensätzlich auf — `fontStyleForRun` fragt ihn deshalb nie an.
    expect(styledFontSpecs('PT Sans', 60).some((spec) => spec.includes('bold italic'))).toBe(false);
  });
});
