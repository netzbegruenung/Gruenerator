import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ selectCatalogImage: vi.fn() }));
vi.mock('./selectCatalogImage.js', () => ({ selectCatalogImage: mocks.selectCatalogImage }));

import service from './ImageSelectionService.js';

const BEER = 'zion-c-p07RGfScf3c-unsplash.jpg';

function offeredFilenames(): string[] {
  const images = mocks.selectCatalogImage.mock.calls[0]?.[2] as { filename: string }[];
  return images.map((img) => img.filename);
}

beforeEach(() => {
  mocks.selectCatalogImage.mockReset();
  mocks.selectCatalogImage.mockImplementation((_t: string, _s: string, images: unknown[]) =>
    Promise.resolve({
      selectedImage: images[0],
      confidence: 1,
      reasoning: '',
      alternatives: [],
      selectionMethod: 'direct_ai_selection',
    })
  );
});

describe('ImageSelectionService exclusions', () => {
  it('offers the whole catalog without exclusions', async () => {
    await service.selectBestImage('x');
    expect(offeredFilenames()).toContain(BEER);
  });

  it('drops excluded tags and filenames', async () => {
    await service.selectBestImage('x', { excludeTags: ['beer'], excludeFilenames: ['a.jpg'] });
    expect(offeredFilenames()).not.toContain(BEER);
  });

  it('keeps the catalog when the exclusions would leave nothing', async () => {
    const all = service.getCatalog()!.images.map((img) => img.filename);
    await service.selectBestImage('x', { excludeFilenames: all });
    expect(offeredFilenames()).toHaveLength(all.length);
  });
});
