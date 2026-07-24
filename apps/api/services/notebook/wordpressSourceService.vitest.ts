import { describe, it, expect } from 'vitest';

import { buildScopeUrls, type WpScope } from './wordpressSourceService.js';

const SITE = 'https://gruene-beispielstadt.de';

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('buildScopeUrls', () => {
  it('requests posts for a category scope, filtered by category id', () => {
    const urls = buildScopeUrls(SITE, [{ kind: 'category', id: 7, name: 'Klima' }], null);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/wp-json/wp/v2/posts');
    expect(paramsOf(urls[0]).get('categories')).toBe('7');
  });

  it('requests the pages endpoint without an include filter when no ids are given', () => {
    const urls = buildScopeUrls(SITE, [{ kind: 'pages', ids: null }], null);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/wp-json/wp/v2/pages');
    expect(paramsOf(urls[0]).has('include')).toBe(false);
  });

  it('treats an empty id list as "all pages" so legacy refs keep their meaning', () => {
    const urls = buildScopeUrls(SITE, [{ kind: 'pages', ids: [] }], null);

    expect(urls).toHaveLength(1);
    expect(paramsOf(urls[0]).has('include')).toBe(false);
  });

  it('requests only the selected pages by id', () => {
    const urls = buildScopeUrls(SITE, [{ kind: 'pages', ids: [12, 5, 88] }], null);

    expect(urls).toHaveLength(1);
    const params = paramsOf(urls[0]);
    expect(params.get('include')).toBe('12,5,88');
    // per_page must cover the whole chunk, else WP silently truncates.
    expect(params.get('per_page')).toBe('3');
  });

  it('chunks selections beyond the WP per_page maximum into several requests', () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);

    const urls = buildScopeUrls(SITE, [{ kind: 'pages', ids }], null);

    expect(urls).toHaveLength(3);
    const includes = urls.map((u) => paramsOf(u).get('include')?.split(',') ?? []);
    expect(includes.map((c) => c.length)).toEqual([100, 100, 50]);
    // Every id is requested exactly once across the chunks.
    expect(
      includes
        .flat()
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual(ids);
  });

  it('carries the incremental filter onto page-id requests', () => {
    const since = '2026-07-01T00:00:00.000Z';

    const urls = buildScopeUrls(SITE, [{ kind: 'pages', ids: [3] }], since);

    const params = paramsOf(urls[0]);
    expect(params.get('modified_after')).toBe(since);
    expect(params.get('orderby')).toBe('modified');
  });

  it('emits one request per scope when several are combined', () => {
    const scopes: WpScope[] = [
      { kind: 'category', id: 1, name: 'A' },
      { kind: 'allPosts' },
      { kind: 'pages', ids: [4, 9] },
    ];

    const urls = buildScopeUrls(SITE, scopes, null);

    expect(urls).toHaveLength(3);
    expect(urls.filter((u) => u.includes('/wp/v2/pages'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('/wp/v2/posts'))).toHaveLength(2);
  });
});
