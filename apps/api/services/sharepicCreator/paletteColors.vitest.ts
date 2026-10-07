import { describe, expect, it } from 'vitest';

import {
  paletteHinweis,
  paletteHint,
  paletteSubstitutions,
  withPaletteColors,
} from './paletteColors.js';

describe('paletteSubstitutions — colours the sharepic palette does not have', () => {
  it('maps Sand to the closest light ground of each country', () => {
    expect(paletteSubstitutions('Ändere die Hintergrundfarbe auf Sand', 'de-DE')).toEqual([
      { asked: 'Sand', color: 'hellgrau' },
    ]);
    expect(paletteSubstitutions('Ändere die Hintergrundfarbe auf Sand', 'de-AT')).toEqual([
      { asked: 'Sand', color: 'weiss' },
    ]);
  });

  it('reads beige and creme as light grounds, also as adjective', () => {
    expect(paletteSubstitutions('Mach den Hintergrund beige', 'de-DE')).toEqual([
      { asked: 'Beige', color: 'hellgrau' },
    ]);
    expect(paletteSubstitutions('Die Fläche bitte cremefarben', 'de-DE')).toEqual([
      { asked: 'Creme', color: 'hellgrau' },
    ]);
  });

  it("maps the other country's palette names", () => {
    expect(paletteSubstitutions('Hintergrund in Mint', 'de-AT')).toEqual([
      { asked: 'Mint', color: 'hellgruen' },
    ]);
    expect(paletteSubstitutions('Hintergrund in Mint', 'de-DE')).toEqual([]);
  });

  it('leaves a word that is no colour request alone', () => {
    expect(paletteSubstitutions('Neuer Sandkasten am Spielplatz', 'de-DE')).toEqual([]);
    expect(paletteSubstitutions('Wir bringen Sand an den Strand', 'de-DE')).toEqual([]);
    expect(paletteSubstitutions('Hintergrund hellgrau', 'de-DE')).toEqual([]);
  });

  it('states the mapping for the model and the person', () => {
    const subs = [{ asked: 'Sand', color: 'hellgrau' as const }];
    expect(paletteHint(subs)).toContain('„Sand“ gibt es im Sharepic-Baukasten nicht');
    expect(paletteHint(subs)).toContain('`hellgrau`');
    expect(paletteHinweis(subs)).toBe(
      'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen.'
    );
    expect(paletteHint([])).toBe('');
    expect(paletteHinweis([])).toBeNull();
  });
});

describe('withPaletteColors', () => {
  it('turns a colour outside the palette into its closest one, wherever it stands', () => {
    const input = {
      locale: 'de-DE',
      slides: [
        { background: { kind: 'farbe', color: 'sand' } },
        { background: { kind: 'foto', panelColor: 'Weiß' } },
      ],
      patch: [{ op: 'set_color', color: 'Sand' }],
    };
    expect(withPaletteColors(input, 'de-DE')).toEqual({
      locale: 'de-DE',
      slides: [
        { background: { kind: 'farbe', color: 'hellgrau' } },
        { background: { kind: 'foto', panelColor: 'weiss' } },
      ],
      patch: [{ op: 'set_color', color: 'hellgrau' }],
    });
  });

  it('keeps allowed and unknown values as they are', () => {
    const input = { background: { color: 'tanne' }, other: { color: 'lila' }, text: 'sand' };
    expect(withPaletteColors(input, 'de-DE')).toEqual(input);
  });
});
