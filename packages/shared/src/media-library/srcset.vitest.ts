import { describe, expect, it } from 'vitest';

import { CANVAS_PREVIEW_WIDTH, shareCanvasPreviewUrl } from './srcset';

describe('shareCanvasPreviewUrl', () => {
  it('übersetzt die ladbare Download-URL in die Canvas-Preview', () => {
    expect(shareCanvasPreviewUrl('/api/share/abc123/download')).toBe(
      '/api/share/abc123/preview?w=2160&fmt=webp'
    );
  });

  it('benutzt 2160 als Canvas-Working-Tier, nimmt aber eine andere Breite an', () => {
    expect(CANVAS_PREVIEW_WIDTH).toBe(2160);
    expect(shareCanvasPreviewUrl('/api/share/abc123/download', 800)).toBe(
      '/api/share/abc123/preview?w=800&fmt=webp'
    );
  });

  it.each([
    ['Blob-Vorschauen', 'blob:http://localhost/5d41402a-b4d3-11e9-9ee5-0a4c1e6b9c7c'],
    ['Fern-URLs von Stock-Bildern', 'https://images.unsplash.com/photo-123.jpg?w=1080'],
    ['andere Pfade', '/media/foo/bar.png'],
    ['bereits Preview-URLs', '/api/share/abc123/preview?w=800&fmt=webp'],
  ])('lässt %s in Ruhe', (_label, url) => {
    expect(shareCanvasPreviewUrl(url)).toBe(url);
  });

  it('antwortet auf nichts mit undefined', () => {
    expect(shareCanvasPreviewUrl(undefined)).toBeUndefined();
  });
});
