import { describe, expect, it } from 'vitest';

import { EMOJI_ASSETS, STICKER_ASSETS } from '../brand/grueneAssetCatalog';

import {
  ALL_ASSETS,
  createStickerInstance,
  getAssetById,
  getAssetBySrc,
  isStickerLikeInstance,
  resolveAssetInstanceSrc,
  TEMPLATE_ASSETS,
} from './canvasAssets';

const SHOP_ID = 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
const SHARE_SRC = '/api/share/0123456789abcdef0123456789abcdef/download';
const FOREIGN_SRC = 'https://evil.example/x.png';

/**
 * What every lookup answers for every graphic a canvas can name, pinned as
 * JSON. Saved canvases reference assets by id and src (F0): moving the
 * catalogue behind the host must leave this file unchanged.
 */
describe('asset lookup golden', () => {
  it('answers every id and src as before', async () => {
    const catalogue = [...ALL_ASSETS, ...TEMPLATE_ASSETS, ...EMOJI_ASSETS, ...STICKER_ASSETS];
    const ids = [
      ...catalogue.map((a) => a.id),
      'emoji-1f600',
      'emoji-1f9d1_1f3fb',
      'emoji-xyz',
      SHOP_ID,
      'unknown',
    ];
    const lookups = {
      byId: ids.map((id) => [id, getAssetById(id) ?? null]),
      bySrc: catalogue.map((a) => [a.src, getAssetBySrc(a.src)?.id ?? null]),
      instances: ids.flatMap((assetId) =>
        [undefined, SHARE_SRC, FOREIGN_SRC].map((src) => {
          const instance = src ? { assetId, src } : { assetId };
          return [
            assetId,
            src ?? null,
            resolveAssetInstanceSrc(instance),
            isStickerLikeInstance(instance),
          ];
        })
      ),
      stickers: ids.flatMap((id) =>
        [`/${id}.png`, SHARE_SRC, FOREIGN_SRC].map((src) => {
          const sticker = createStickerInstance({ id, src }, 1080, 1350);
          return [id, src, sticker ? { assetId: sticker.assetId, src: sticker.src ?? null } : null];
        })
      ),
    };
    await expect(`${JSON.stringify(lookups, null, 1)}\n`).toMatchFileSnapshot(
      '__golden__/assetLookups.json'
    );
  });
});
