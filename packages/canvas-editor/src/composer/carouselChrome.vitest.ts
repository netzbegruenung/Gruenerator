import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  duplicatePageById,
  getPagesMap,
  movePageById,
  readPages,
  removePageById,
  seedPagesIfEmpty,
} from '../collab/pagesDoc';

import {
  type ChromePage,
  refreshCarouselChrome,
  refreshCarouselChromeInDoc,
} from './carouselChrome';
import { composeSharepic, SHAREPIC_COLOR_HEX } from './composeSharepic';

import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { AssetInstance } from '../utils/canvasAssets';
import type { ShapeInstance } from '../utils/shapes';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/media/${f}`, measure };

const slide = (extra: Partial<SharepicSlide> = {}): SharepicSlide => ({
  background: { kind: 'farbe', color: 'dunkeltanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'absatz', text: 'Ein Satz, der etwas erklärt.' }],
  logo: false,
  ...extra,
});

const deck = (
  slides: SharepicSlide[],
  extra: Partial<SharepicSpec> = {},
  locale: SharepicSpec['locale'] = 'de-DE'
): ChromePage[] => {
  const composed = composeSharepic({ locale, slides, ...extra }, options);
  return composed.slides.map((s) => ({
    configId: composed.templateType,
    state: s as unknown as Record<string, unknown>,
  }));
};

/** Applies the refresh like the page ops do: the partial over the old state. */
const refresh = (pages: ChromePage[]): ChromePage[] => {
  const partials = refreshCarouselChrome(pages, measure);
  return pages.map((p, i) => ({ ...p, state: { ...p.state, ...partials[i] } }));
};

const texts = (p: ChromePage) => (p.state.additionalTexts ?? []) as AdditionalText[];
const textOf = (p: ChromePage, id: string) => texts(p).find((t) => t.id === id)?.text;
const order = (p: ChromePage) => p.state.layerOrder as string[];
const hasArrow = (p: ChromePage) => order(p).includes('sc-pfeil');
const dots = (p: ChromePage) =>
  (p.state.shapeInstances as ShapeInstance[]).filter((s) => /^sc-seite-\d+$/.test(s.id));

describe('refreshCarouselChrome', () => {
  it('changes nothing on a deck the composer just built', () => {
    const pages = deck([slide(), slide(), slide()], { seitenzahl: 'bruch' });
    expect(refreshCarouselChrome(pages, measure)).toEqual([null, null, null]);
    const punkte = deck([slide({ nummer: 'gross' }), slide(), slide({ nummer: 'gross' })], {
      seitenzahl: 'punkte',
    });
    expect(refreshCarouselChrome(punkte, measure)).toEqual([null, null, null]);
  });

  it('renumbers k/n and drops the last page’s arrow and teaser after a delete', () => {
    const [a, , c] = deck([slide({ weiter: 'Weiter →' }), slide(), slide({ weiter: 'Und? →' })], {
      seitenzahl: 'bruch',
    });
    const after = refresh([a!, c!]);
    expect(after.map((p) => textOf(p, 'sc-seite'))).toEqual(['1/2', '2/2']);
    expect(after.map(hasArrow)).toEqual([true, false]);
    expect(textOf(after[1]!, 'sc-weiter')).toBeUndefined();
    expect(order(after[1]!)).not.toContain('sc-weiter');
    expect(after[1]!.state.selectedIcons).not.toContain('sc-pfeil');
    expect(after[1]!.state.iconStates).not.toHaveProperty('sc-pfeil');
    expect(textOf(after[0]!, 'sc-weiter')).toBe('Weiter →');
  });

  it('keeps the right-aligned page number on its right edge when it grows', () => {
    const pages = deck(
      Array.from({ length: 9 }, () => slide()),
      { seitenzahl: 'bruch' }
    );
    const before = texts(pages[0]!).find((t) => t.id === 'sc-seite')!;
    const after = refresh([...pages, pages[8]!]);
    const label = texts(after[0]!).find((t) => t.id === 'sc-seite')!;
    expect(label.text).toBe('1/10');
    expect(label.width).toBeGreaterThan(before.width);
    expect(label.x + label.width).toBeCloseTo(before.x + before.width);
  });

  it('gives a duplicate its own number and numeral', () => {
    const [a, b, c] = deck(
      [slide({ nummer: 'gross' }), slide({ nummer: 'gross' }), slide({ nummer: 'geist' })],
      { seitenzahl: 'bruch' }
    );
    const after = refresh([a!, a!, b!, c!]);
    expect(after.map((p) => textOf(p, 'sc-seite'))).toEqual(['1/4', '2/4', '3/4', '4/4']);
    // `gross` writes "k.", `geist` a bare "k".
    expect(after.map((p) => textOf(p, 'sc-nummer'))).toEqual(['1.', '2.', '3.', '4']);
  });

  it('moves the arrow off the new last page and onto the old one, in that page’s ink', () => {
    const [a, b, c] = deck([
      slide(),
      slide(),
      slide({ background: { kind: 'farbe', color: 'weiss' } }),
    ]);
    // The light last slide moves to the front.
    const after = refresh([c!, a!, b!]);
    expect(after.map(hasArrow)).toEqual([true, true, false]);
    const moved = (after[0]!.state.iconStates as Record<string, IconState>)['sc-pfeil']!;
    const template = (a!.state.iconStates as Record<string, IconState>)['sc-pfeil']!;
    expect(moved.color).toBe(SHAREPIC_COLOR_HEX.dunkeltanne);
    expect(template.color).toBe('#FFFFFF');
    expect([moved.x, moved.y, moved.scale]).toEqual([template.x, template.y, template.scale]);
    expect(after[0]!.state.selectedIcons).toContain('sc-pfeil');
  });

  it('re-adds the AT brush arrow as an asset, green on a light panel', () => {
    const [a, b] = deck(
      [
        slide(),
        slide({ background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'weiss' } }),
      ],
      {},
      'de-AT'
    );
    const after = refresh([b!, a!]);
    const arrow = (after[0]!.state.assetInstances as AssetInstance[]).find(
      (x) => x.id === 'sc-pfeil'
    );
    expect(arrow?.assetId).toBe('brush-arrow-gruen');
    expect(hasArrow(after[1]!)).toBe(false);
  });

  it('adds no arrow when the deck has none', () => {
    const [a, b] = deck([slide(), slide()], { pfeil: false });
    expect(refresh([b!, a!]).map(hasArrow)).toEqual([false, false]);
  });

  it('rebuilds the dot row for the new count, centred where it was', () => {
    const [a, , c] = deck([slide(), slide(), slide()], { seitenzahl: 'punkte' });
    const after = refresh([a!, c!]);
    for (const [index, page] of after.entries()) {
      const row = dots(page);
      expect(row.map((d) => d.id)).toEqual(['sc-seite-0', 'sc-seite-1']);
      expect(row.map((d) => d.opacity)).toEqual(index === 0 ? [1, 0.35] : [0.35, 1]);
      expect((row[0]!.x + row[1]!.x) / 2).toBeCloseTo(540);
      expect(order(page).filter((id) => id.startsWith('sc-seite-'))).toEqual([
        'sc-seite-0',
        'sc-seite-1',
      ]);
    }
  });

  it('counts other templates but leaves them alone', () => {
    const [a, b] = deck([slide(), slide()], { seitenzahl: 'bruch' });
    const zitat: ChromePage = { configId: 'zitat', state: { quote: 'x' } };
    const partials = refreshCarouselChrome([a!, b!, zitat], measure);
    expect(partials[2]).toBeNull();
    expect(refresh([a!, b!, zitat]).map((p) => textOf(p, 'sc-seite') ?? null)).toEqual([
      '1/3',
      '2/3',
      null,
    ]);
  });
});

describe('refreshCarouselChromeInDoc', () => {
  const origin = Symbol('test-page-op');
  const seeded = () => {
    const doc = new Y.Doc();
    const pages = deck([slide(), slide(), slide()], { seitenzahl: 'bruch' });
    seedPagesIfEmpty(
      doc,
      pages.map((p, i) => ({ id: `p${i}`, configId: p.configId, state: p.state }))
    );
    const undo = new Y.UndoManager(getPagesMap(doc), {
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    return { doc, undo };
  };
  const labels = (doc: Y.Doc) =>
    readPages(doc).map((v) => [
      (v.state.additionalTexts as AdditionalText[]).find((t) => t.id === 'sc-seite')?.text,
      (v.state.layerOrder as string[]).includes('sc-pfeil'),
    ]);

  it('runs with delete, duplicate and move, and undoes with the page op', () => {
    const { doc, undo } = seeded();
    doc.transact(() => {
      removePageById(doc, 'p2');
      refreshCarouselChromeInDoc(doc);
    }, origin);
    expect(labels(doc)).toEqual([
      ['1/2', true],
      ['2/2', false],
    ]);
    doc.transact(() => {
      duplicatePageById(doc, 'p0', 'copy');
      refreshCarouselChromeInDoc(doc);
    }, origin);
    expect(labels(doc)).toEqual([
      ['1/3', true],
      ['2/3', true],
      ['3/3', false],
    ]);
    doc.transact(() => {
      movePageById(doc, 'p1', 'up');
      refreshCarouselChromeInDoc(doc);
    }, origin);
    expect(readPages(doc).map((v) => v.id)).toEqual(['p0', 'p1', 'copy']);
    expect(labels(doc)).toEqual([
      ['1/3', true],
      ['2/3', true],
      ['3/3', false],
    ]);
    undo.undo();
    undo.undo();
    expect(labels(doc)).toEqual([
      ['1/2', true],
      ['2/2', false],
    ]);
    undo.undo();
    expect(labels(doc)).toEqual([
      ['1/3', true],
      ['2/3', true],
      ['3/3', false],
    ]);
  });
});
