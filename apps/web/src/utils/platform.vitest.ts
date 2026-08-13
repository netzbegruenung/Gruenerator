import { describe, expect, it } from 'vitest';

import { shareThumbnailPreviewUrl } from './platform';

describe('shareThumbnailPreviewUrl', () => {
  describe('signed thumbs URLs', () => {
    const signed = '/api/thumbs/canvas/abc/v1?sig=SIG&w=400&fmt=webp';

    it('replaces the size the API already minted rather than appending a second one', () => {
      // Appending would make `req.query.w` an array server-side, and
      // Number(['400','200']) is NaN → 400 → a blank tile on the very surfaces
      // the endpoint exists to fill.
      const url = shareThumbnailPreviewUrl(signed, 200) as string;
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.getAll('w')).toEqual(['200']);
      expect(params.getAll('fmt')).toEqual(['webp']);
    });

    it('keeps the signature intact', () => {
      const url = shareThumbnailPreviewUrl(signed, 800) as string;
      expect(new URLSearchParams(url.split('?')[1]).get('sig')).toBe('SIG');
      expect(url.split('?')[0]).toBe('/api/thumbs/canvas/abc/v1');
    });

    it('sizes a base that carries no w/fmt yet', () => {
      const url = shareThumbnailPreviewUrl('/api/thumbs/media/tok/v1?sig=SIG', 200) as string;
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('w')).toBe('200');
      expect(params.get('fmt')).toBe('webp');
    });
  });

  describe('legacy share URLs', () => {
    it('rewrites a full-resolution download URL to a resized preview', () => {
      expect(shareThumbnailPreviewUrl('/api/share/tok/download', 400)).toBe(
        '/api/share/tok/preview?w=400&fmt=webp'
      );
    });

    it.each([
      ['an absolute URL', 'https://example.org/api/share/tok/download'],
      ['an unrelated path', '/images/logo.png'],
      ['a blob URL', 'blob:http://localhost/abc'],
    ])('passes %s through untouched', (_label, url) => {
      expect(shareThumbnailPreviewUrl(url)).toBe(url);
    });

    it('passes undefined through', () => {
      expect(shareThumbnailPreviewUrl(undefined)).toBeUndefined();
    });
  });
});
