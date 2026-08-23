import { describe, expect, it } from 'vitest';

import { apiOrigin, buildSearchImagesView, proxyImageUri } from './searchImagesView';

import type { SearchImage } from './searchImagesView';

function image(n: number, proxied = true): SearchImage {
  return {
    title: `Bild ${n}`,
    url: `https://beispiel.de/${n}.jpg`,
    domain: 'beispiel.de',
    ...(proxied ? { proxyUrl: `/api/search-image?url=${n}&exp=1&sig=s` } : {}),
  };
}

describe('apiOrigin', () => {
  it('strips the /api suffix so an absolute API path can be appended', () => {
    expect(apiOrigin('https://gruenerator.eu/api')).toBe('https://gruenerator.eu');
  });

  it('tolerates a trailing slash after /api', () => {
    expect(apiOrigin('https://gruenerator.eu/api/')).toBe('https://gruenerator.eu');
  });

  it('leaves a bare origin alone', () => {
    expect(apiOrigin('https://test.gruenerator.eu')).toBe('https://test.gruenerator.eu');
  });

  it('falls back to production when the env var is empty', () => {
    expect(apiOrigin('')).toBe('https://gruenerator.eu');
  });
});

describe('proxyImageUri', () => {
  it('joins the signed path to the origin exactly once', () => {
    expect(proxyImageUri('/api/search-image?url=a', 'https://gruenerator.eu/api')).toBe(
      'https://gruenerator.eu/api/search-image?url=a'
    );
  });
});

describe('buildSearchImagesView', () => {
  it('counts the hits in the heading, in the singular for one', () => {
    expect(
      buildSearchImagesView([image(1)], { expanded: false, authenticated: true }).heading
    ).toBe('1 gefundene Bildquelle');
    expect(
      buildSearchImagesView([image(1), image(2)], { expanded: false, authenticated: true }).heading
    ).toBe('2 gefundene Bildquellen');
  });

  it('falls back to links when no hit carries a proxy path', () => {
    const view = buildSearchImagesView([image(1, false), image(2, false)], {
      expanded: false,
      authenticated: true,
    });
    expect(view.mode).toBe('links');
    expect(view.tiles).toHaveLength(2);
  });

  it('falls back to links without a bearer token, because the proxy needs auth', () => {
    const view = buildSearchImagesView([image(1)], { expanded: false, authenticated: false });
    expect(view.mode).toBe('links');
  });

  // The rule the whole file exists for: a tile must never hand the phone a
  // third-party URL to fetch.
  it('never carries a source host into thumbnailPath', () => {
    const view = buildSearchImagesView([image(1), image(2, false)], {
      expanded: true,
      authenticated: true,
    });
    for (const tile of view.tiles) {
      expect(tile.thumbnailPath === null || tile.thumbnailPath.startsWith('/api/')).toBe(true);
    }
  });

  it('drops thumbnails from every tile in link mode, not just the unproxied one', () => {
    const view = buildSearchImagesView([image(1), image(2, false)], {
      expanded: false,
      authenticated: false,
    });
    expect(view.tiles.every((t) => t.thumbnailPath === null)).toBe(true);
  });

  it('shows three tiles and hangs the remainder on the last one', () => {
    const view = buildSearchImagesView([image(1), image(2), image(3), image(4), image(5)], {
      expanded: false,
      authenticated: true,
    });
    expect(view.tiles).toHaveLength(3);
    expect(view.tiles.map((t) => t.moreCount)).toEqual([0, 0, 2]);
  });

  it('marks no counter when everything already fits', () => {
    const view = buildSearchImagesView([image(1), image(2), image(3)], {
      expanded: false,
      authenticated: true,
    });
    expect(view.tiles.map((t) => t.moreCount)).toEqual([0, 0, 0]);
  });

  it('shows every hit once expanded, with the counter gone', () => {
    const view = buildSearchImagesView([image(1), image(2), image(3), image(4)], {
      expanded: true,
      authenticated: true,
    });
    expect(view.tiles).toHaveLength(4);
    expect(view.tiles.every((t) => t.moreCount === 0)).toBe(true);
  });

  it('keeps a hit without its own proxy path in tile mode, as a link tile', () => {
    const view = buildSearchImagesView([image(1), image(2, false)], {
      expanded: true,
      authenticated: true,
    });
    expect(view.mode).toBe('tiles');
    expect(view.tiles[1]?.thumbnailPath).toBeNull();
  });
});
