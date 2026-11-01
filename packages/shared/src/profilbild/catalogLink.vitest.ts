import { describe, expect, it } from 'vitest';

import {
  allPresetDesigns,
  COLLECTION_PRESET_DESIGNS,
  presetDesigns,
  presetsForCollection,
} from './backgrounds';
import { parseProfilbildCatalogParams, profilbildCatalogParams } from './catalogLink';

const params = (search: Record<string, string>) => new URLSearchParams(search);

describe('collection backgrounds', () => {
  it('are offered only through their collection, but resolve like any saved preset', () => {
    const offered = [...presetDesigns(false), ...presetDesigns(true)].map((d) => d.id);
    for (const design of COLLECTION_PRESET_DESIGNS) {
      expect(offered).not.toContain(design.id);
      expect(allPresetDesigns(false)).toContain(design);
    }
    expect(presetsForCollection('gruene-jugend').length).toBeGreaterThan(0);
    expect(presetsForCollection('gruene-jugend-oesterreich').length).toBeGreaterThan(0);
  });

  it('have ids no other preset uses', () => {
    const ids = allPresetDesigns(false).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('profilbild catalogue links', () => {
  it('round-trips a sticker and a background', () => {
    const sticker = parseProfilbildCatalogParams(
      params(profilbildCatalogParams({ kind: 'sticker', id: 'gj-at-stoerer' }))
    );
    expect(sticker).toMatchObject({ kind: 'sticker', id: 'gj-at-stoerer' });
    const background = parseProfilbildCatalogParams(
      params(profilbildCatalogParams({ kind: 'background', id: 'gj-at-veilchen' }))
    );
    expect(background).toEqual({ kind: 'background', id: 'gj-at-veilchen', title: 'Veilchen' });
  });

  it('ignores ids the catalogue does not know', () => {
    expect(parseProfilbildCatalogParams(params({ sticker: 'nope' }))).toBeNull();
    expect(parseProfilbildCatalogParams(params({ hintergrund: 'nope' }))).toBeNull();
    expect(parseProfilbildCatalogParams(params({}))).toBeNull();
  });
});
