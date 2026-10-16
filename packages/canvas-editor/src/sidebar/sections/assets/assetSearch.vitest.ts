import { beforeAll, describe, expect, it } from 'vitest';

import { loadAllIcons, type IconDef } from '../../../utils/canvasIcons';

import { searchAssetCatalog, type SearchResultType } from './assetSearch';

const ALL_FEATURES = {
  hasAssetsFeature: true,
  hasShapesFeature: true,
  hasChartsFeature: true,
  hasIconsFeature: true,
  hasFramesFeature: true,
};

let icons: IconDef[] = [];

// Loading all seven icon sets (~18k names) is far beyond the 5 s test default.
beforeAll(async () => {
  icons = await loadAllIcons();
}, 60_000);

const top = (query: string, type: SearchResultType, n: number) =>
  searchAssetCatalog(query, ALL_FEATURES, 'de-DE', icons)
    .filter((r) => r.type === type)
    .slice(0, n)
    .map((r) => r.name);

describe('asset search against the real catalogs', () => {
  // German query → the icon a user means, within the first few tiles.
  // Each of these used to fail: substring hits ("car" in "Cart") sorted
  // alphabetically pushed the wanted icon behind the 20-tile cut.
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
  ])('"%s" shows the %s icon among the first five', (query, expected) => {
    expect(top(query, 'icon', 5)).toContain(expected);
  });

  it.each([
    ['auto', ['Add To Cart', 'Arrow Autofit Content']],
    ['windrad', ['Air Balloon', 'Air Conditioner']],
    ['stern', ['Align Start']],
    ['sport', ['Account Pin Box Fill', 'Add Pin Alt']],
    ['bildung', ['Add Media Image', 'Adobe Photoshop']],
  ])('"%s" no longer shows substring noise', (query, noise) => {
    const icons = top(query, 'icon', 20);
    for (const name of noise) expect(icons).not.toContain(name);
  });

  it('keeps German labels reachable by word start and compound part', () => {
    expect(top('sonne', 'element', 10)).toEqual(expect.arrayContaining(['Sonne', 'Sonnenblume']));
    expect(top('blume', 'element', 10)).toContain('Sonnenblume');
  });

  it('ranks the exact label or its main translation first', () => {
    expect(top('sonne', 'element', 1)).toEqual(['Sonne']);
    expect(top('kreis', 'shape', 1)).toEqual(['Kreis']);
    expect(top('auto', 'icon', 1)).toEqual(['Car']);
    expect(top('stern', 'icon', 1)).toEqual(['Star']);
  });

  it('accepts English inflections but not longer words', () => {
    expect(top('wald', 'icon', 5)).toContain('Trees');
    expect(top('stern', 'element', 5)).not.toContain('Bizeps');
  });

  it('does not match two-letter fragments inside words', () => {
    expect(top('ei', 'element', 50)).toEqual([]);
  });
});
