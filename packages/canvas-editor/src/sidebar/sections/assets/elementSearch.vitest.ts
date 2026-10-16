import { beforeAll, describe, expect, it } from 'vitest';

import { ALL_ASSETS, stickerAssetsForLocale } from '../../../utils/canvasAssets';
import { loadAllIcons } from '../../../utils/canvasIcons';
import { getAllIllustrations } from '../../../utils/illustrations/registry';

import { searchElements } from './elementSearch';
import {
  assetItem,
  CHART_ITEMS,
  EMOJI_ITEMS,
  FRAME_ITEMS,
  iconItem,
  illustrationItem,
  SHAPE_ITEMS,
  type CategoryId,
} from './useElementCatalog';
import { stockPhotoItem } from './useStockPhotos';

import type { ElementItem } from './elementTypes';

type Category = { id: CategoryId; searchable: boolean; items: ElementItem[] };
let catalog: Category[] = [];

// Loading all seven icon sets (~18k names) is far beyond the 5 s test default.
beforeAll(async () => {
  const [icons, illustrations] = await Promise.all([loadAllIcons(), getAllIllustrations()]);
  const cat = (id: CategoryId, items: ElementItem[]): Category => ({ id, searchable: true, items });
  catalog = [
    cat('marke', ALL_ASSETS.filter((a) => a.audience !== 'de-AT').map(assetItem)),
    cat('sticker', stickerAssetsForLocale('de-DE').map(assetItem)),
    cat('formen', SHAPE_ITEMS),
    cat('diagramme', CHART_ITEMS),
    cat('rahmen', FRAME_ITEMS),
    cat('illustrationen', illustrations.map(illustrationItem)),
    cat('icons', icons.map(iconItem)),
    cat('emoji', EMOJI_ITEMS),
  ];
}, 60_000);

const labels = (items: ElementItem[], n: number) => items.slice(0, n).map((i) => i.label);
const inCategory = (id: CategoryId, query: string, n: number) =>
  labels(searchElements(catalog, query, catalog.find((c) => c.id === id) ?? null), n);
const everywhere = (query: string, kind: string, n: number) =>
  labels(
    searchElements(catalog, query, null).filter((i) => i.key.startsWith(`${kind}:`)),
    n
  );

describe('element search against the real catalogues', () => {
  // German query → the icon a user means. Each used to fail: substring hits
  // ("car" in "Cart") in catalogue order filled the 20-tile cap first.
  it.each([
    ['auto', 'Car'],
    ['windrad', 'Windmill'],
    ['stern', 'Star'],
    ['sonne', 'Sun'],
    ['daumen hoch', 'Thumb Up'],
    ['pfeil rechts', 'Arrow Right'],
    ['instagram', 'Instagram'],
    ['kreuz', 'Cross'],
    ['lupe', 'Search'],
    ['megafon', 'Megaphone'],
    ['zug', 'Train'],
    ['müll', 'Trash'],
    ['frieden', 'Peace'],
    ['gluehbirne', 'Bulb'],
    ['glühbirne', 'Bulb'],
  ])('"%s" shows the %s icon among the first five, everywhere and in Icons', (query, icon) => {
    expect(everywhere(query, 'icon', 5)).toContain(icon);
    expect(inCategory('icons', query, 5)).toContain(icon);
  });

  it.each([
    ['auto', ['Add To Cart', 'Arrow Autofit Content']],
    ['windrad', ['Air Balloon', 'Air Conditioner']],
    ['stern', ['Align Start']],
    ['sport', ['Account Pin Box Fill', 'Add Pin Alt']],
    ['bildung', ['Add Media Image', 'Adobe Photoshop']],
  ])('"%s" no longer shows substring noise', (query, noise) => {
    const shown = everywhere(query, 'icon', 20);
    for (const name of noise) expect(shown).not.toContain(name);
  });

  it('ranks the exact label or its main translation first', () => {
    expect(inCategory('formen', 'kreis', 1)).toEqual(['Kreis']);
    expect(inCategory('icons', 'auto', 1)).toEqual(['Car']);
    expect(inCategory('icons', 'stern', 1)).toEqual(['Star']);
  });

  it('finds German compounds and English inflections inside categories', () => {
    expect(inCategory('marke', 'blume', 10)).toContain('Sonnenblume (Gelb)');
    expect(inCategory('illustrationen', 'menschen', 5).length).toBe(5);
    expect(inCategory('icons', 'blumen', 5)).toContain('Flower');
    expect(inCategory('icons', 'wald', 5)).toContain('Trees');
    expect(inCategory('illustrationen', 'fahrrad', 5)).toContain('Fahrradtour');
    expect(inCategory('rahmen', 'rahmen', 30).length).toBeGreaterThan(5);
  });

  it('finds short compound heads, ranked after real matches', () => {
    expect(inCategory('formen', 'rad', 1)).toEqual(['Zahnrad']);
  });

  it('puts the photo that matches the word itself before its category siblings', () => {
    // Every transport photo carries "Fahrrad" as a category keyword and the same label.
    const train = stockPhotoItem({ filename: 'train.jpg', category: 'transport', tags: ['train'] });
    const bike = stockPhotoItem({ filename: 'bike.jpg', category: 'transport', tags: ['bicycle'] });
    const fotos = { id: 'fotos' as const, searchable: true, items: [train, bike] };
    expect(searchElements([fotos], 'fahrrad', fotos).map((i) => i.key)).toEqual([
      'photo:bike.jpg',
      'photo:train.jpg',
    ]);
  });

  it('does not match longer English words or two-letter fragments', () => {
    expect(everywhere('stern', 'asset', 5)).not.toContain('Bizeps');
    expect(inCategory('marke', 'ei', 50)).toEqual([]);
  });

  it('caps the search across categories only after ranking', () => {
    expect(everywhere('menschen', 'illustration', 100)).toHaveLength(30);
    expect(inCategory('illustrationen', 'menschen', 1000).length).toBeGreaterThan(30);
  });
});
