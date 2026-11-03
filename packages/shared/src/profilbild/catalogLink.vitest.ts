import { describe, expect, it, vi } from 'vitest';

import {
  allPresetDesigns,
  COLLECTION_PRESET_DESIGNS,
  presetDesigns,
  presetsForCollection,
} from './backgrounds';
import { SYSTEM_STICKERS } from '../stickers/catalog.js';

import { parseProfilbildCatalogParams, profilbildCatalogParams } from './catalogLink';

// No catalogue entry is a frame yet; this one stands in for the first.
vi.mock('../stickers/catalog.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../stickers/catalog.js')>();
  const frame = {
    ...original.SYSTEM_STICKERS[0],
    id: 'test-rahmen',
    label: 'Testrahmen',
    frame: true,
  };
  return {
    ...original,
    systemStickerById: (id: string) =>
      id === 'test-rahmen' ? frame : original.systemStickerById(id),
    isFrameSticker: (s: { frame?: true }) => s.frame === true,
  };
});

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

  it('parse rahmen=<frame id> → {kind:frame, id}', () => {
    expect(parseProfilbildCatalogParams(params({ rahmen: 'test-rahmen' }))).toEqual({
      kind: 'frame',
      id: 'test-rahmen',
      title: 'Testrahmen',
    });
  });

  it('parse rahmen=<plain sticker id> → null', () => {
    const plain = SYSTEM_STICKERS[0].id;
    expect(parseProfilbildCatalogParams(params({ rahmen: plain }))).toBeNull();
  });

  it('params round-trip for frame', () => {
    const pick = parseProfilbildCatalogParams(
      params(profilbildCatalogParams({ kind: 'frame', id: 'test-rahmen' }))
    );
    expect(pick).toMatchObject({ kind: 'frame', id: 'test-rahmen' });
  });

  it('still resolves a background taken out of its collection, but no longer offers it', () => {
    const retired = parseProfilbildCatalogParams(
      params(profilbildCatalogParams({ kind: 'background', id: 'gj-hellgruen-zackenstern' }))
    );
    expect(retired).toMatchObject({ kind: 'background', id: 'gj-hellgruen-zackenstern' });
    expect(presetsForCollection('gruene-jugend').map((d) => d.id)).not.toContain(
      'gj-hellgruen-zackenstern'
    );
  });

  it('offers the gradient from gruene-jugend.de first, with its angle and stops', () => {
    expect(presetsForCollection('gruene-jugend')[0]).toMatchObject({
      id: 'gj-verlauf',
      base: {
        kind: 'gradient',
        angle: 200,
        stops: ['#FF8568', '#F28ADE', '#9F88FF', '#C7FF7A'],
        positions: [0.1476, 0.3508, 0.6047, 0.8537],
      },
    });
  });
});
