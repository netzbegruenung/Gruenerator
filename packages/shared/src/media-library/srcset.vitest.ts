import { describe, expect, it } from 'vitest';

import { CANVAS_PREVIEW_WIDTH, shareCanvasPreviewUrl, shareThumbnailPreviewUrl } from './srcset';

describe('shareCanvasPreviewUrl', () => {
  it('übersetzt die ladbare Download-URL in die Canvas-Preview', () => {
    expect(shareCanvasPreviewUrl('/api/share/abc123/download')).toBe(
      '/api/share/abc123/preview?w=3240&fmt=webp'
    );
  });

  it('benutzt 3240 als Canvas-Working-Tier, nimmt aber eine andere Breite an', () => {
    expect(CANVAS_PREVIEW_WIDTH).toBe(3240);
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

describe('shareThumbnailPreviewUrl', () => {
  it('übersetzt die Download-Form in die Kachel-Preview', () => {
    expect(shareThumbnailPreviewUrl('/api/share/abc123/download')).toBe(
      '/api/share/abc123/preview?w=400&fmt=webp'
    );
    expect(shareThumbnailPreviewUrl('/api/share/abc123/download', 200)).toBe(
      '/api/share/abc123/preview?w=200&fmt=webp'
    );
  });

  it('ersetzt w/fmt bei /api/thumbs-URLs statt sie anzuhängen', () => {
    expect(shareThumbnailPreviewUrl('/api/thumbs/abc123.png?w=200&fmt=webp', 800)).toBe(
      '/api/thumbs/abc123.png?w=800&fmt=webp'
    );
  });

  it.each([
    ['Blob-Vorschauen', 'blob:http://localhost/5d41402a-b4d3-11e9-9ee5-0a4c1e6b9c7c'],
    ['andere Pfade', '/media/foo/bar.png'],
  ])('lässt %s in Ruhe', (_label, url) => {
    expect(shareThumbnailPreviewUrl(url)).toBe(url);
  });

  it('antwortet auf nichts mit undefined', () => {
    expect(shareThumbnailPreviewUrl(undefined)).toBeUndefined();
  });
});
