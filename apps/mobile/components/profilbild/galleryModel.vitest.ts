import { describe, expect, it } from 'vitest';

import { galleryErrorText, galleryStickerSource, galleryTilePath } from './galleryModel';

const SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

describe('galleryModel', () => {
  it('shows the signed thumbnail, else the file itself', () => {
    expect(galleryTilePath({ thumbUrl: '/api/thumbs/x.webp', src: SRC })).toBe(
      '/api/thumbs/x.webp'
    );
    expect(galleryTilePath({ thumbUrl: null, src: SRC })).toBe(SRC);
  });

  it('turns an item into a sticker source with an asset id', () => {
    expect(galleryStickerSource({ id: 'abc', src: SRC })).toEqual({
      id: 'asset:abc',
      src: SRC,
      defaultScale: 1,
    });
  });

  it('names a failed list per kind', () => {
    expect(galleryErrorText('sticker')).toBe('Sticker konnten nicht geladen werden.');
  });
});
