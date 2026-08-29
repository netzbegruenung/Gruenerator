import { describe, expect, it } from 'vitest';

import { canvasImageSourceUrl } from './canvasImageSource';

describe('canvasImageSourceUrl', () => {
  it('renders the 2160px working tier while the box fits the export budget', () => {
    expect(canvasImageSourceUrl('/api/share/abc123/download', 1080)).toBe(
      '/api/share/abc123/preview?w=2160&fmt=webp'
    );
    expect(canvasImageSourceUrl('/api/share/abc123/download', 540)).toBe(
      '/api/share/abc123/preview?w=2160&fmt=webp'
    );
  });

  it('loads the stored original once the box exceeds the budget', () => {
    expect(canvasImageSourceUrl('/api/share/abc123/download', 1081)).toBe(
      '/api/share/abc123/download'
    );
  });

  it('loads the stored original for a 3x-zoomed full-width background', () => {
    expect(canvasImageSourceUrl('/api/share/abc123/download', 3240)).toBe(
      '/api/share/abc123/download'
    );
  });

  it.each([
    ['blob: previews', 'blob:http://localhost/5d41402a-b4d3-11e9-9ee5-0a4c1e6b9c7c'],
    ['remote stock URLs', 'https://images.unsplash.com/photo-123.jpg'],
    ['data: URIs', 'data:image/png;base64,abc'],
  ])('passes %s through unchanged at any width', (_label, url) => {
    expect(canvasImageSourceUrl(url, 100)).toBe(url);
    expect(canvasImageSourceUrl(url, 4000)).toBe(url);
  });

  it('keeps undefined URLs undefined', () => {
    expect(canvasImageSourceUrl(undefined, 1080)).toBeUndefined();
  });
});
