/**
 * `textFormLabel` entscheidet, unter welchem Namen ein Stil analysiert und im
 * Stilblock überschrieben wird. Drei Aufrufer teilen sie sich (`analyze`,
 * `create`, `add_examples`), und der Vorrang war einmal umgekehrt — diese
 * Fälle halten ihn fest.
 */
import { describe, expect, it } from 'vitest';

import { textFormLabel, textTypeLabel } from './textFormAnalysisService.js';

describe('textFormLabel', () => {
  it('nimmt den Titel, auch wenn ein Textyp danebensteht', () => {
    // Der gemeldete Fehler: ein Landesverbands-Rezept trägt `textType: 'presse'`
    // und hieß in der Analyse trotzdem nur „Pressemitteilungen".
    expect(textFormLabel('presse', 'Pressemitteilungen Hessen')).toBe('Pressemitteilungen Hessen');
  });

  it('nimmt den Titel ohne Textyp', () => {
    expect(textFormLabel(null, 'Vereinseinladungen')).toBe('Vereinseinladungen');
  });

  it('trimmt den Titel, bevor er zur Überschrift wird', () => {
    expect(textFormLabel(null, '  Vereinseinladungen  ')).toBe('Vereinseinladungen');
  });

  it('fällt auf die kanonische Beschriftung zurück, wenn kein Titel da ist', () => {
    expect(textFormLabel('instagram', '   ')).toBe(textTypeLabel('instagram'));
    expect(textFormLabel('instagram', '   ')).toBe('Instagram-Posts');
  });

  it('liefert leer, wenn weder Titel noch Textyp da sind', () => {
    // Am Contract unerreichbar (`title` ist Pflicht); hier nur festgehalten,
    // damit die Funktion nicht still `undefined` in die Überschrift schreibt.
    expect(textFormLabel(null, '')).toBe('');
  });
});
