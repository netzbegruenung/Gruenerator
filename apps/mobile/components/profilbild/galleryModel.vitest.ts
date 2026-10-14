import { describe, expect, it } from 'vitest';

import {
  GALLERY_SCOPES,
  galleryEmptyText,
  galleryErrorText,
  galleryStickerSource,
  galleryTilePath,
} from './galleryModel';

const SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

describe('galleryModel', () => {
  it('offers Entdecken, Meine and Gemerkt in that order', () => {
    expect(GALLERY_SCOPES.map((s) => [s.value, s.label])).toEqual([
      ['shop', 'Entdecken'],
      ['mine', 'Meine'],
      ['saved', 'Gemerkt'],
    ]);
  });

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

  it('names the empty and failed lists per kind and scope', () => {
    expect(galleryEmptyText('sticker', 'mine')).toBe('Du hast noch keine eigenen Sticker.');
    expect(galleryEmptyText('background', 'saved')).toBe(
      'Du hast dir noch keine Hintergründe gemerkt.'
    );
    expect(galleryEmptyText('background', 'shop')).toBe(
      'Unter „Entdecken“ gibt es noch keine Hintergründe.'
    );
    expect(galleryErrorText('sticker')).toBe('Sticker konnten nicht geladen werden.');
  });
});
