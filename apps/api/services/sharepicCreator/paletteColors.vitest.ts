import { describe, expect, it } from 'vitest';

import {
  describeBackgrounds,
  paletteHinweis,
  paletteHint,
  paletteSubstitutions,
  withPaletteColors,
  withoutPaletteHinweis,
} from './paletteColors.js';

describe('paletteSubstitutions — colours the sharepic palette does not have', () => {
  it('maps Sand to the closest light ground of each country', () => {
    expect(paletteSubstitutions('Ändere die Hintergrundfarbe auf Sand', 'de-DE')).toEqual([
      { asked: 'Sand', color: 'creme' },
    ]);
    expect(paletteSubstitutions('Ändere die Hintergrundfarbe auf Sand', 'de-AT')).toEqual([
      { asked: 'Sand', color: 'weiss' },
    ]);
  });

  it('reads beige as creme, also as adjective; creme itself is a DE colour', () => {
    expect(paletteSubstitutions('Mach den Hintergrund beige', 'de-DE')).toEqual([
      { asked: 'Beige', color: 'creme' },
    ]);
    expect(paletteSubstitutions('Die Fläche bitte cremefarben', 'de-DE')).toEqual([]);
    expect(paletteSubstitutions('Die Fläche bitte cremefarben', 'de-AT')).toEqual([
      { asked: 'Creme', color: 'weiss' },
    ]);
  });

  it('reads compound colour names', () => {
    expect(paletteSubstitutions('Hintergrund bitte dunkelgrau', 'de-DE')).toEqual([
      { asked: 'Dunkelgrau', color: 'dunkeltanne' },
    ]);
    expect(paletteSubstitutions('Hintergrund in Mintgrün', 'de-DE')).toEqual([
      { asked: 'Mintgrün', color: 'mint' },
    ]);
    expect(paletteSubstitutions('Hintergrund in Mintgrün', 'de-AT')).toEqual([
      { asked: 'Mintgrün', color: 'hellgruen' },
    ]);
    expect(paletteSubstitutions('Fläche in Sandbeige', 'de-DE')).toEqual([
      { asked: 'Sandbeige', color: 'creme' },
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
        { background: { kind: 'farbe', color: 'creme' } },
        { background: { kind: 'foto', panelColor: 'weiss' } },
      ],
      patch: [{ op: 'set_color', color: 'creme' }],
    });
  });

  it('maps a header band colour like the ground under it', () => {
    expect(
      withPaletteColors({ background: { kind: 'farbe', color: 'mint', kopfband: 'Sand' } }, 'de-DE')
    ).toEqual({ background: { kind: 'farbe', color: 'mint', kopfband: 'creme' } });
  });

  it('coerces compound names as a whole value', () => {
    expect(
      withPaletteColors(
        [
          { color: 'dunkelgrau' },
          { color: 'Mintgrün' },
          { panelColor: 'sandbeige' },
          { color: 'hellgrau' },
        ],
        'de-DE'
      )
    ).toEqual([
      { color: 'dunkeltanne' },
      { color: 'mint' },
      { panelColor: 'creme' },
      { color: 'hellgrau' },
    ]);
  });

  it('strips its own sentences from a hinweis', () => {
    expect(
      withoutPaletteHinweis(
        'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen. Kein Foto gefunden.'
      )
    ).toBe('Kein Foto gefunden.');
    expect(
      withoutPaletteHinweis(
        'Sand gibt es im Sharepic-Baukasten nicht – ich habe Hellgrau genommen.'
      )
    ).toBeNull();
    expect(withoutPaletteHinweis(null)).toBeNull();
  });

  it('keeps allowed and unknown values as they are', () => {
    const input = { background: { color: 'tanne' }, other: { color: 'lila' }, text: 'sand' };
    expect(withPaletteColors(input, 'de-DE')).toEqual(input);
  });
});

describe('describeBackgrounds — what the deck already shows', () => {
  const slide = (background: object) => ({ background, items: [] }) as never;

  it('names one shared colour once', () => {
    const spec = {
      locale: 'de-DE',
      slides: [slide({ kind: 'farbe', color: 'mint' }), slide({ kind: 'farbe', color: 'mint' })],
    } as never;
    expect(describeBackgrounds(spec)).toBe('Aktueller Hintergrund: Mint.');
  });

  it('names each slide when they differ, own photos included', () => {
    const spec = {
      locale: 'de-DE',
      slides: [
        slide({ kind: 'foto-unten', filename: 'upload:1', panelColor: 'tanne' }),
        slide({ kind: 'farbe', color: 'hellgrau' }),
      ],
    } as never;
    expect(describeBackgrounds(spec)).toBe(
      'Aktueller Hintergrund: Folie 1 eigenes Foto mit Fläche Tanne, Folie 2 Hellgrau.'
    );
  });
});
