import { describe, expect, it } from 'vitest';

import { collectAltTextPages } from '../collectAltTextPages';

describe('collectAltTextPages', () => {
  it('checks later pages and reports every missing or failed capture', async () => {
    const captured: number[] = [];
    const refs = [null, 'image-2', null, 'image-4'].map((image, index) => ({
      current: {
        captureCanvasForAi: async () => {
          captured.push(index + 1);
          return image;
        },
        getVisibleTexts: () => [`Text ${index + 1}`],
      },
    }));
    await expect(
      collectAltTextPages([...refs, { current: null }], [0, 1, 2, 3, 4])
    ).rejects.toThrow('Seite(n) 1, 3, 5 konnten nicht erfasst werden');
    expect(captured).toEqual([1, 2, 3, 4]);
  });

  it('preserves requested order, page numbers and editor texts', async () => {
    const refs = ['image-1', 'image-2', 'image-3'].map((image, index) => ({
      current: {
        captureCanvasForAi: async () => image,
        getVisibleTexts: () => [`Text ${index + 1}`],
      },
    }));
    await expect(collectAltTextPages(refs, [2, 0])).resolves.toEqual([
      { pageNumber: 3, image: 'image-3', texts: ['Text 3'] },
      { pageNumber: 1, image: 'image-1', texts: ['Text 1'] },
    ]);
    await expect(collectAltTextPages(refs, [1])).resolves.toEqual([
      { pageNumber: 2, image: 'image-2', texts: ['Text 2'] },
    ]);
  });
});
