import {
  GRUENE_ASSET_CATALOG,
  registerAssetCatalog,
} from '@gruenerator/canvas-editor/grueneAssetCatalog';
import { profilbildStickersToAssetInstances } from '@gruenerator/canvas-editor/profilbildStickers';
import { type SavedProfilbildSticker } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const SHOP_ID = 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10' as const;
const SHARE_SRC = '/api/share/0123456789abcdef0123456789abcdef/download';
const box = { x: 100, y: 100, width: 150, height: 150, rotation: 0 };

// The editor's graphics are host data: `src/index.tsx` registers this
// catalogue before the first render. Runs in the node lane, which loads no
// setup file, so the first test sees the editor as a foreign host would.
describe('the Grünerator asset catalogue', () => {
  it('is what makes a saved sticker draw', () => {
    const saved: SavedProfilbildSticker[] = [
      { id: 'teamgruen', ...box },
      { id: SHOP_ID, src: SHARE_SRC, ...box },
    ];
    expect(profilbildStickersToAssetInstances(saved, 1000, 1000)).toEqual([]);

    registerAssetCatalog(GRUENE_ASSET_CATALOG);

    expect(
      profilbildStickersToAssetInstances(saved, 1000, 1000).map((i) => [i.assetId, i.src ?? null])
    ).toEqual([
      ['teamgruen', null],
      [SHOP_ID, SHARE_SRC],
    ]);
  });
});
