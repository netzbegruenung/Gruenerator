import {
  type CanvasAssetCatalog,
  createStickerInstance,
  getAssetById,
  getAssetBySrc,
  isStickerLikeInstance,
  registerAssetCatalog,
  resolveAssetInstanceSrc,
  type UniversalAsset,
} from '@ggraphic/editor/utils/canvasAssets';
import { describe, expect, it } from 'vitest';

import { GRUENE_ASSET_CATALOG } from '../brand/grueneAssetCatalog';

const NO_HOST: CanvasAssetCatalog = { assets: [], isInstanceSrc: () => false };
const SHOP_ID = 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
const SHARE_SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

describe('without a host catalogue', () => {
  it('knows no catalogue graphic', () => {
    expect(getAssetById('teamgruen', NO_HOST)).toBeUndefined();
    expect(getAssetById('quote-mark', NO_HOST)).toBeUndefined();
    expect(getAssetBySrc('/sonnenblume_weiss.svg', NO_HOST)).toBeUndefined();
    expect(resolveAssetInstanceSrc({ assetId: 'teamgruen' }, NO_HOST)).toBeNull();
  });

  it('knows no emoji file, so a placed emoji draws nothing', () => {
    expect(getAssetById('emoji-1f600', NO_HOST)).toBeUndefined();
    expect(resolveAssetInstanceSrc({ assetId: 'emoji-1f600' }, NO_HOST)).toBeNull();
  });

  it('ignores an instance src, so saved state cannot point anywhere', () => {
    const shop = { assetId: SHOP_ID, src: SHARE_SRC };
    expect(resolveAssetInstanceSrc(shop, NO_HOST)).toBeNull();
    expect(isStickerLikeInstance(shop, NO_HOST)).toBe(false);
    expect(createStickerInstance({ id: SHOP_ID, src: SHARE_SRC }, 1080, 1080, NO_HOST)).toBeNull();
  });
});

describe("a host's emoji files", () => {
  const host: CanvasAssetCatalog = {
    ...NO_HOST,
    emojiSrc: (code) => `https://cdn.example/noto/${code}.svg`,
  };

  it('draw a placed emoji from its id alone', () => {
    expect(getAssetById('emoji-1f9d1_1f3fb', host)).toMatchObject({
      src: 'https://cdn.example/noto/1f9d1_1f3fb.svg',
      label: '🧑🏻',
      category: 'emoji',
    });
    expect(getAssetById('emoji-../x', host)).toBeUndefined();
  });

  // F0: the Grünerator's emoji files, stored in canvases by id.
  it("keep the Grünerator's paths", () => {
    expect(GRUENE_ASSET_CATALOG.emojiSrc?.('1f600')).toBe('/emoji/emoji_u1f600.svg');
    expect(getAssetById('emoji-1f44d_1f3ff', GRUENE_ASSET_CATALOG)?.src).toBe(
      '/emoji/emoji_u1f44d_1f3ff.svg'
    );
  });
});

describe('the registered catalogue', () => {
  it('answers lookups made without one', () => {
    const own: UniversalAsset = {
      id: 'own-mark',
      src: '/own/mark.svg',
      label: 'Eigene Marke',
      category: 'sticker',
      tags: [],
      audience: 'all',
    };
    registerAssetCatalog({ assets: [own], isInstanceSrc: (src) => src.startsWith('/own/') });
    try {
      expect(getAssetById('own-mark')).toBe(own);
      expect(getAssetById('teamgruen')).toBeUndefined();
      expect(getAssetBySrc('/own/mark.svg')).toBe(own);
      expect(resolveAssetInstanceSrc({ assetId: 'x', src: '/own/x.png' })).toBe('/own/x.png');
      expect(resolveAssetInstanceSrc({ assetId: 'x', src: SHARE_SRC })).toBeNull();
    } finally {
      registerAssetCatalog(GRUENE_ASSET_CATALOG);
    }
    expect(getAssetById('teamgruen')?.category).toBe('sticker');
  });
});
