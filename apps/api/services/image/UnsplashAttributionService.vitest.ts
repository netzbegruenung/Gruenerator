import { describe, expect, it } from 'vitest';

import { parseFilename } from './UnsplashAttributionService.js';

describe('parseFilename', () => {
  it.each([
    ['benjamin-jopen-2SfssudtyIA-unsplash.jpg', 'benjamin-jopen', '2SfssudtyIA'],
    ['inigo-de-la-maza-s285sDw5Ikc-unsplash.jpg', 'inigo-de-la-maza', 's285sDw5Ikc'],
    ['zion-c-p07RGfScf3c-unsplash.jpg', 'zion-c', 'p07RGfScf3c'],
    ['tasha-kostyuk-Pk-KuizxQv8-unsplash.jpg', 'tasha-kostyuk', 'Pk-KuizxQv8'],
    ['egor-vikhrev--E6jqIGzgOY-unsplash.jpg', 'egor-vikhrev', '-E6jqIGzgOY'],
    ['absolutvision-WYd_PkCa1BY-unsplash.jpg', 'absolutvision', 'WYd_PkCa1BY'],
    ['2y-kang-dFohf_GUZJ0-unsplash.jpg', '2y-kang', 'dFohf_GUZJ0'],
  ])('reads %s', (filename, photographerSlug, photoId) => {
    expect(parseFilename(filename)).toEqual({ photographerSlug, photoId });
  });

  it('rejects files that are not from Unsplash', () => {
    expect(parseFilename('wind.jpg')).toBeNull();
  });
});
