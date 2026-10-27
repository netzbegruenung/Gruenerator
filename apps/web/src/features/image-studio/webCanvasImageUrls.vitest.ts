import { canvasImageSourceUrl } from '@gruenerator/canvas-editor';
import { describe, expect, it } from 'vitest';

import { webCanvasImageUrls as urls } from './webCanvasImageUrls';

describe('canvas image sources on the Grünerator', () => {
  it('renders the 2160px working tier while the box fits the export budget', () => {
    expect(canvasImageSourceUrl('/api/share/abc123/download', 1080, urls)).toBe(
      '/api/share/abc123/preview?w=2160&fmt=webp'
    );
    expect(canvasImageSourceUrl('/api/share/abc123/download', 540, urls)).toBe(
      '/api/share/abc123/preview?w=2160&fmt=webp'
    );
  });

  it('loads the stored original through the cacheable /preview once the box exceeds the budget', () => {
    expect(canvasImageSourceUrl('/api/share/abc123/download', 1081, urls)).toBe(
      '/api/share/abc123/preview'
    );
    expect(canvasImageSourceUrl('/api/share/abc123/download', 3240, urls)).toBe(
      '/api/share/abc123/preview'
    );
  });

  it('renders the working tier of a bundled stock background', () => {
    expect(canvasImageSourceUrl('/api/image-picker/stock-image/a.jpg', 1080, urls)).toBe(
      '/api/image-picker/stock-image/a.jpg?w=2160&fmt=webp'
    );
  });

  it.each([
    ['blob: previews', 'blob:http://localhost/5d41402a-b4d3-11e9-9ee5-0a4c1e6b9c7c'],
    ['remote stock URLs', 'https://images.unsplash.com/photo-123.jpg'],
    ['data: URIs', 'data:image/png;base64,abc'],
  ])('passes %s through unchanged at any width', (_label, url) => {
    expect(canvasImageSourceUrl(url, 100, urls)).toBe(url);
    expect(canvasImageSourceUrl(url, 4000, urls)).toBe(url);
  });

  it('fetches a share download link through /preview, the original without a deadline', () => {
    expect(urls.originalUrl('/api/share/abc123/download')).toBe('/api/share/abc123/preview');
  });

  it('leaves every other URL alone when fetching the original', () => {
    for (const url of [
      'blob:http://localhost/x',
      'https://example.org/api/share/abc/download',
      '/api/share/abc/preview?w=400',
      '/api/image-picker/stock-image/a.jpg',
    ]) {
      expect(urls.originalUrl(url)).toBe(url);
    }
  });

  it('places a library item from its media URL, its share download, else its thumbnail', () => {
    const item = { id: 'm1', shareToken: 'tok', thumbnailUrl: '/thumb.webp' };
    expect(urls.placementUrl({ ...item, mediaUrl: '/full.jpg' })).toBe('/full.jpg');
    expect(urls.placementUrl(item)).toBe('/api/share/tok/download');
    expect(urls.placementUrl({ ...item, shareToken: '' })).toBe('/thumb.webp');
  });
});
