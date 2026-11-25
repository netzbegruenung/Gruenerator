import { describe, expect, it } from 'vitest';

import { type BrandLocale } from '../brand/grueneBrand.js';

import {
  buildFolie,
  DECK_STILE,
  deckStilBoxes,
  deckStilFlow,
  type DeckStilId,
} from './deckStile/index.js';
import { contrastRatio, SYMBOLE } from './deckStile/shared.js';
import { fitSlideTexts, type FlowSpec, type MeasureText } from './fitText.js';
import {
  FOLIEN_ICON_FALLBACK,
  FOLIEN_ICON_KEYS,
  FOLIEN_ICONS,
  folienIconId,
  folienIconKeyOf,
} from './folienIcons.js';
import { deckSpecSchema, folieSpecSchema, type FolieSpec } from './folienTypen.js';
import { restyleDeck } from './restyleDeck.js';
import { composeSlideDeck, readFolie } from './slideDeck.js';

const DATE = new Date('2026-10-30T12:00:00Z');
const LOCALES: BrandLocale[] = ['de-DE', 'de-AT'];
const STILE = DECK_STILE.map((s) => s.id) as DeckStilId[];

const spec = (n: number): FolieSpec => ({
  typ: 'symbole',
  slots: {
    headline: 'Was wir für die Stadt tun',
    symbole: ['bahn', 'kita', 'haus', 'klima'].slice(0, n),
    labels: ['Mehr Bahn', 'Kita-Plätze', 'Wohnen', 'Klima'].slice(0, n),
    zeilen: [
      'Dichtere Takte',
      'Ein Platz für jedes Kind',
      'Bezahlbar bauen',
      'Solar aufs Dach',
    ].slice(0, n),
  },
});
const ctx = (locale: BrandLocale) => ({
  locale,
  date: DATE,
  pageNumber: 2,
  title: 'Stadt',
  index: 1,
});

describe('symbole schema', () => {
  it('takes three or four columns and rejects two or five labels', () => {
    expect(folieSpecSchema.safeParse(spec(3)).success).toBe(true);
    expect(folieSpecSchema.safeParse(spec(4)).success).toBe(true);
    const labels = (n: number) => ({
      ...spec(4),
      slots: { ...spec(4).slots, labels: Array.from({ length: n }, (_, i) => `M${i}`) },
    });
    expect(folieSpecSchema.safeParse(labels(2)).success).toBe(false);
    expect(folieSpecSchema.safeParse(labels(5)).success).toBe(false);
  });

  it('never fails on an unknown icon key, but on a label over its budget', () => {
    const slots = { ...spec(3).slots } as Record<string, unknown>;
    expect(
      folieSpecSchema.safeParse({ typ: 'symbole', slots: { ...slots, symbole: ['x', 'y', 'z'] } })
        .success
    ).toBe(true);
    const long = { ...slots, labels: ['x'.repeat(21), 'b', 'c'] };
    expect(folieSpecSchema.safeParse({ typ: 'symbole', slots: long }).success).toBe(false);
    expect(deckSpecSchema.safeParse({ title: 'T', slides: [spec(3)] }).success).toBe(true);
  });
});

describe('folien icons', () => {
  it('lists around forty topics, each with a distinct Tabler icon', () => {
    expect(FOLIEN_ICON_KEYS.length).toBeGreaterThanOrEqual(30);
    expect(FOLIEN_ICON_KEYS.length).toBeLessThanOrEqual(60);
    const ids = Object.values(FOLIEN_ICONS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of ['bahn', 'bus', 'fahrrad', 'fussweg', 'schule', 'kita', 'haus']) {
      expect(FOLIEN_ICONS).toHaveProperty(key);
    }
  });

  it('resolves keys case- and umlaut-insensitively and falls back for the unknown', () => {
    expect(folienIconId('Bahn')).toBe('tabler:train');
    expect(folienIconId(' Fußweg ')).toBe('tabler:walk');
    expect(folienIconId('gibt-es-nicht')).toBe(FOLIEN_ICONS[FOLIEN_ICON_FALLBACK]);
    expect(folienIconId('')).toBe(FOLIEN_ICONS[FOLIEN_ICON_FALLBACK]);
    // Ein Icon, das im Editor getauscht wurde, bleibt, was es ist.
    expect(folienIconId('tabler:rocket')).toBe('tabler:rocket');
    expect(folienIconKeyOf('tabler:train')).toBe('bahn');
    expect(folienIconKeyOf('tabler:rocket')).toBe('tabler:rocket');
  });
});

describe('symbole layout', () => {
  for (const stil of STILE) {
    for (const locale of LOCALES) {
      for (const n of [3, 4]) {
        it(`${stil} / ${locale} / ${n} columns: centred row of circles with icons, clear of footer and each other`, () => {
          const state = buildFolie(stil, spec(n), ctx(locale));
          const circles = state.shapeInstances.filter((s) => /^folie-kreis-\d+$/.test(s.id));
          expect(circles).toHaveLength(n);
          for (const [i, c] of circles.entries()) {
            // Beamergröße: etwa 230–300 px.
            expect(c.width).toBeGreaterThanOrEqual(230);
            expect(c.width).toBeLessThanOrEqual(300);
            expect(c.height).toBe(c.width);
            expect(c.x - c.width / 2).toBeGreaterThanOrEqual(SYMBOLE.x);
            expect(c.x + c.width / 2).toBeLessThanOrEqual(SYMBOLE.x + SYMBOLE.width);
            // Die Kreise enden über der Marke und weit über der Fußzeile (y 1028).
            expect(c.y + c.height / 2).toBeLessThan(SYMBOLE.labelTop);
            if (i > 0) {
              const prev = circles[i - 1]!;
              expect(c.x - c.width / 2).toBeGreaterThan(prev.x + prev.width / 2);
            }
            // Das Icon sitzt mittig im Kreis, einfarbig und mit Kontrast (Grafik: 3:1).
            const icon = state.iconStates[`folie-symbol-${i + 1}`]!;
            expect(icon.x).toBe(c.x);
            expect(icon.y).toBe(c.y);
            expect(icon.scale * 120).toBeLessThan(c.width);
            expect(contrastRatio(icon.color!, c.fill)).toBeGreaterThanOrEqual(3);
          }
          // Die Reihe ist mittig auf der Folie.
          const left = Math.min(...circles.map((c) => c.x));
          const right = Math.max(...circles.map((c) => c.x));
          expect((left + right) / 2).toBeCloseTo(960, 0);
          // Piktogramme als Icons, die in layerOrder über ihrem Kreis liegen.
          for (let i = 1; i <= n; i++) {
            const order = state.layerOrder;
            expect(order.indexOf(`folie-symbol-${i}`)).toBeGreaterThan(
              order.indexOf(`folie-kreis-${i}`)
            );
          }
          expect(state.selectedIcons).toHaveLength(n);
          // Marke und Zeile unter dem Kreis, in Beamergröße, mittig.
          const label = state.additionalTexts.find((t) => t.id === 'folie-label-1')!;
          const line = state.additionalTexts.find((t) => t.id === 'folie-symboltext-1')!;
          expect(label.fontSize).toBeGreaterThanOrEqual(44);
          expect(line.fontSize).toBeGreaterThanOrEqual(40);
          expect(label.align).toBe('center');
          expect(label.y).toBeGreaterThan(circles[0]!.y + circles[0]!.height / 2);
          expect(line.y).toBeGreaterThan(label.y);
          expect(line.y + line.fontSize * 1.25).toBeLessThan(1028);
        });
      }
    }
  }

  it('puts the circles on tiles in kacheln and keeps the texts inside them', () => {
    const state = buildFolie('kacheln', spec(4), ctx('de-DE'));
    for (let i = 1; i <= 4; i++) {
      const tile = state.shapeInstances.find((s) => s.id === `folie-kachel-${i}`)!;
      const circle = state.shapeInstances.find((s) => s.id === `folie-kreis-${i}`)!;
      const line = state.additionalTexts.find((t) => t.id === `folie-symboltext-${i}`)!;
      expect(circle.y - circle.height / 2).toBeGreaterThan(tile.y - tile.height / 2);
      expect(line.x).toBeGreaterThan(tile.x - tile.width / 2);
      expect(line.x + line.width).toBeLessThan(tile.x + tile.width / 2);
    }
  });

  it('uses a top band in band and keeps the footer date off it', () => {
    const state = buildFolie('band', spec(3), ctx('de-DE'));
    const band = state.shapeInstances.find((s) => s.id === 'folie-band')!;
    expect(band.width).toBe(1920);
    const head = state.additionalTexts.find((t) => t.id === 'folie-headline')!;
    expect(head.y).toBeLessThan(band.height);
    const datum = state.additionalTexts.find((t) => t.id === 'folie-datum')!;
    expect(datum.fill).not.toBe('#FFFFFF');
  });

  it('has no bars and no sunflower: no rotated shapes, no sunflower assets', () => {
    for (const stil of STILE) {
      const state = buildFolie(stil, spec(3), ctx('de-AT'));
      expect(state.shapeInstances.every((s) => s.rotation === 0)).toBe(true);
      expect(state.assetInstances.filter((a) => /sunflower/.test(a.assetId))).toEqual([]);
    }
  });

  it('tolerates short arrays: a missing line leaves the label, a missing icon gets the fallback', () => {
    const folie = {
      typ: 'symbole',
      slots: { headline: 'H', symbole: ['bahn'], labels: ['A', 'B', 'C'], zeilen: ['eins'] },
    } as FolieSpec;
    const state = buildFolie('cd', folie, ctx('de-DE'));
    expect(state.additionalTexts.some((t) => t.id === 'folie-label-3')).toBe(true);
    expect(state.additionalTexts.some((t) => t.id === 'folie-symboltext-2')).toBe(false);
    expect(state.iconStates['folie-symbol-3']!.iconId).toBe('tabler:star');
  });
});

describe('symbole round trips', () => {
  for (const locale of LOCALES) {
    it(`reads back the spec in every style, and a restyle keeps it (${locale})`, () => {
      for (const n of [3, 4]) {
        const original = { ...spec(n), notes: 'Notiz' } as FolieSpec;
        for (const stil of STILE) {
          const deck = composeSlideDeck(
            { title: 'Stadt', slides: [original] },
            { locale, date: DATE, stil }
          );
          const page = {
            id: 'p1',
            configId: deck.pages[0]!.configId,
            state: deck.pages[0]!.state as unknown as Record<string, unknown>,
          };
          expect(readFolie(page.state), `${stil} ${n}`).toEqual(original);
          for (const to of STILE) {
            const [out] = restyleDeck([page], to, { locale, date: DATE, title: 'Stadt' });
            expect(out!.state['deckStil']).toBe(to);
            expect(readFolie(out!.state), `${stil} → ${to}`).toEqual(original);
          }
        }
      }
    });
  }

  it('keeps an icon the person swapped in the editor through a restyle', () => {
    const deck = composeSlideDeck(
      { title: 'Stadt', slides: [spec(3)] },
      { locale: 'de-DE', date: DATE, stil: 'cd' }
    );
    const state = deck.pages[0]!.state as unknown as Record<string, unknown>;
    (state['iconStates'] as Record<string, { iconId: string }>)['folie-symbol-2']!.iconId =
      'tabler:rocket';
    expect(readFolie(state)!.slots).toMatchObject({ symbole: ['bahn', 'tabler:rocket', 'haus'] });
    const [out] = restyleDeck([{ id: 'p', configId: 'freeform', state }], 'ruhig', {
      locale: 'de-DE',
      date: DATE,
      title: 'Stadt',
    });
    expect(
      (out!.state['iconStates'] as Record<string, { iconId: string }>)['folie-symbol-2']!.iconId
    ).toBe('tabler:rocket');
  });
});

describe('symbole flow', () => {
  /** Fake: Zeilen = ⌈Zeichen × 0,5 × Größe / Breite⌉. */
  const measure: MeasureText = (text, font, width) => ({
    height:
      Math.max(1, Math.ceil((text.length * 0.5 * font.size) / width)) * font.size * font.lineHeight,
  });

  for (const stil of STILE) {
    it(`${stil}: stacks label and line per column, the line below the label, above the footer`, () => {
      const built = buildFolie(stil, spec(4), ctx('de-DE'));
      const flow = deckStilFlow(stil, 'symbole')!;
      expect(Array.isArray(flow)).toBe(true);
      const { state, overflow } = fitSlideTexts(
        built,
        deckStilBoxes(stil, 'symbole'),
        measure,
        null,
        flow
      );
      expect(overflow).toEqual([]);
      for (let i = 1; i <= 4; i++) {
        const label = state.additionalTexts.find((t) => t.id === `folie-label-${i}`)!;
        const line = state.additionalTexts.find((t) => t.id === `folie-symboltext-${i}`)!;
        const labelH = measure(
          label.text,
          { family: 'x', size: label.fontSize, lineHeight: label.lineHeight ?? 1.2 },
          label.width
        ).height;
        const lineH = measure(
          line.text,
          { family: 'x', size: line.fontSize, lineHeight: line.lineHeight ?? 1.2 },
          line.width
        ).height;
        expect(label.y).toBe(SYMBOLE.labelTop);
        expect(line.y).toBeGreaterThanOrEqual(label.y + labelH);
        expect(line.y + lineH).toBeLessThanOrEqual(1028);
      }
    });
  }

  it('shrinks all labels and all lines by one shared scale', () => {
    const folie = {
      typ: 'symbole',
      slots: { ...spec(3).slots, zeilen: ['x '.repeat(35).trim(), 'kurz', 'kurz'] },
    } as FolieSpec;
    const tall: MeasureText = (text, font) => ({
      height: text.length > 30 ? 400 * (font.size / 40) : font.size,
    });
    const { state } = fitSlideTexts(
      buildFolie('cd', folie, ctx('de-DE')),
      deckStilBoxes('cd', 'symbole'),
      tall,
      null,
      deckStilFlow('cd', 'symbole') as FlowSpec[]
    );
    const sizes = [1, 2, 3].map(
      (i) => state.additionalTexts.find((t) => t.id === `folie-symboltext-${i}`)!.fontSize
    );
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeLessThan(40);
  });
});
