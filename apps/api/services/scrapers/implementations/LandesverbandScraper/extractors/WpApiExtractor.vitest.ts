import { describe, expect, it } from 'vitest';

import { buildWpApiUrl } from './WpApiExtractor.js';

describe('buildWpApiUrl', () => {
  it('includes categories_exclude when excludeCategoryIds is configured', () => {
    const url = buildWpApiUrl('https://example.de', '1,2', 1, 100, [122], '');

    expect(url).toContain('categories_exclude=122');
  });

  it('joins multiple excludeCategoryIds with a comma', () => {
    const url = buildWpApiUrl('https://example.de', '1,2', 1, 100, [122, 7], '');

    expect(url).toContain('categories_exclude=122,7');
  });

  it('omits categories_exclude when not configured', () => {
    const url = buildWpApiUrl('https://example.de', '1,2', 1, 100, undefined, '');

    expect(url).not.toContain('categories_exclude');
  });

  it('omits categories_exclude when the array is empty', () => {
    const url = buildWpApiUrl('https://example.de', '1,2', 1, 100, [], '');

    expect(url).not.toContain('categories_exclude');
  });
});
