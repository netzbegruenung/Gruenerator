// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { plainImageUrls, type CanvasImageUrlService } from '@ggraphic/editor/hostServices';
import { canvasImageSourceUrl } from '@ggraphic/editor/utils/canvasImageSource';

/** A host that keeps a 2160px variant of every stored image. */
const host: CanvasImageUrlService = {
  previewWidth: 2160,
  previewUrl: (url) => `${url}#preview`,
  originalUrl: (url) => `${url}#original`,
  placementUrl: (item) => item.mediaUrl ?? null,
};

describe('canvasImageSourceUrl', () => {
  it("renders the host's variant while the box fits the export budget", () => {
    // 1080 x 2 = 2160: sharp at the UI's max export scale.
    expect(canvasImageSourceUrl('https://assets.test/img.jpg', 1080, host)).toBe(
      'https://assets.test/img.jpg#preview'
    );
    expect(canvasImageSourceUrl('https://assets.test/img.jpg', 540, host)).toBe(
      'https://assets.test/img.jpg#preview'
    );
  });

  it('loads the original once the box exceeds the budget', () => {
    expect(canvasImageSourceUrl('https://assets.test/img.jpg', 1081, host)).toBe(
      'https://assets.test/img.jpg#original'
    );
    // A 3x-zoomed full-width background.
    expect(canvasImageSourceUrl('https://assets.test/img.jpg', 3240, host)).toBe(
      'https://assets.test/img.jpg#original'
    );
  });

  it('keeps undefined URLs undefined', () => {
    expect(canvasImageSourceUrl(undefined, 1080, host)).toBeUndefined();
  });

  it('passes every URL through unchanged without a host', () => {
    for (const url of [
      'https://media.test/share/abc/download',
      'blob:http://localhost/x',
      'data:image/png;base64,a',
    ]) {
      expect(canvasImageSourceUrl(url, 100, plainImageUrls)).toBe(url);
      expect(canvasImageSourceUrl(url, 4000, plainImageUrls)).toBe(url);
    }
  });
});

describe('plainImageUrls.placementUrl', () => {
  const item = { id: 'm1', shareToken: 'tok', thumbnailUrl: 'https://assets.test/thumb.webp' };

  it('places the media URL, else the thumbnail', () => {
    expect(plainImageUrls.placementUrl({ ...item, mediaUrl: 'https://assets.test/full.jpg' })).toBe(
      'https://assets.test/full.jpg'
    );
    expect(plainImageUrls.placementUrl(item)).toBe('https://assets.test/thumb.webp');
    expect(plainImageUrls.placementUrl({ ...item, thumbnailUrl: null })).toBeNull();
  });
});
