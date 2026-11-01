import { describe, expect, it } from 'vitest';

import { GRUENE_ASSET_CATALOG, stickerAssetsForLocale } from './grueneAssetCatalog';

// Sticker einer Kollektion gibt es nur über deren Marktplatz-Seite: der Editor
// bietet sie nicht an, löst einen gespeicherten aber weiter auf.
describe('collection stickers', () => {
  it('are resolvable but not offered in the picker', () => {
    expect(GRUENE_ASSET_CATALOG.assets.some((a) => a.id === 'gj-zackenstern')).toBe(true);
    expect(GRUENE_ASSET_CATALOG.offered?.some((a) => a.id === 'gj-zackenstern')).toBe(false);
    expect(stickerAssetsForLocale('de-DE').some((a) => a.id === 'gj-zackenstern')).toBe(false);
    expect(stickerAssetsForLocale('de-DE').some((a) => a.id === 'teamgruen')).toBe(true);
  });
});
