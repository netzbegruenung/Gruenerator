import { describe, expect, it } from 'vitest';

import { DOCS_PAGES, DOCS_SECTIONS, DOCS_SITE_URL } from './docsIndex.generated.js';
import { buildDocsPageMap, docsIndexStats, relatedDocsPages, searchDocs } from './docsIndex.js';

describe('docs index (generated)', () => {
  it('has pages and sections', () => {
    const stats = docsIndexStats();
    expect(stats.pages).toBeGreaterThan(20);
    expect(stats.sections).toBeGreaterThan(100);
  });

  it('serves the docs from the doku host, not the SPA-shadowed docs host', () => {
    // `docs.gruenerator.eu` 301s into the main app, which renders the SPA shell
    // for /docs/* — every deep link built from it looks broken.
    expect(DOCS_SITE_URL).toBe('https://doku.gruenerator.eu');
  });

  it('emits site-relative /docs URLs with no leaked file extensions', () => {
    for (const page of DOCS_PAGES) {
      expect(page.url.startsWith('/docs/')).toBe(true);
      expect(page.url).not.toMatch(/\.mdx?$/);
    }
  });

  it('excludes the folders Docusaurus does not build', () => {
    // intern/** and monitor/** are in docusaurus.config `exclude` — indexing
    // them would produce citations that 404.
    for (const page of DOCS_PAGES) {
      expect(page.url).not.toMatch(/^\/docs\/(intern|monitor)\//);
    }
  });

  it('keeps markdown and MDX syntax out of titles and leads', () => {
    for (const page of DOCS_PAGES) {
      expect(page.title).not.toMatch(/[\\{}<>]/);
      expect(page.lead).not.toMatch(/^(import|export)\s/);
    }
  });

  it('anchors are lowercase slugs on the same page as their section', () => {
    for (const section of DOCS_SECTIONS) {
      if (!section.anchor) continue;
      expect(section.anchor.startsWith('#')).toBe(true);
      expect(section.anchor).toBe(section.anchor.toLowerCase());
    }
  });
});

describe('searchDocs', () => {
  it('finds the how-to page for an operating question', () => {
    const hits = searchDocs('wie lege ich ein eigenes notebook an');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.url).toContain('/docs/notebooks/eigenes-notebook-erstellen');
  });

  it('returns absolute, deep-linked URLs', () => {
    const [hit] = searchDocs('grüne wolke einbinden');
    expect(hit).toBeDefined();
    expect(hit!.url.startsWith('https://doku.gruenerator.eu/docs/')).toBe(true);
  });

  it('folds umlauts so "gruene" matches "Grüne"', () => {
    expect(searchDocs('gruene wolke').length).toBeGreaterThan(0);
  });

  it('ranks documentation above the newsletter archive for how-to questions', () => {
    // Newsletters ANNOUNCE features in keyword-dense prose and used to outrank
    // the actual guide — that is what CATEGORY_PRIOR corrects.
    const [top] = searchDocs('wie erstelle ich ein sharepic');
    expect(top).toBeDefined();
    expect(top!.url).not.toContain('/docs/newsletter/');
  });

  it('still finds the newsletter when the user asks for it', () => {
    const [top] = searchDocs('was war neu im juli 2026');
    expect(top?.url).toContain('/docs/newsletter/');
  });

  it('prefers the page a query names verbatim over generic heading matches', () => {
    // "wie funktioniert" is a stock heading across the corpus; naming a page is
    // the strongest relevance signal a user can give.
    const [top] = searchDocs('wie funktioniert der ki-chat');
    expect(top?.url).toContain('/docs/gruenerieren/ki-chat');
  });

  it('does not let one long page fill the whole result list', () => {
    const hits = searchDocs('grünerator', 5);
    const perPage = new Map<string, number>();
    for (const hit of hits) {
      const page = hit.url.split('#')[0]!;
      perPage.set(page, (perPage.get(page) ?? 0) + 1);
    }
    for (const count of perPage.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('returns nothing for an empty or stopword-only query instead of throwing', () => {
    expect(searchDocs('')).toEqual([]);
    expect(searchDocs('und der die das')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchDocs('grünerator', 3).length).toBeLessThanOrEqual(3);
  });
});

describe('relatedDocsPages', () => {
  it('returns distinct pages without anchors', () => {
    const pages = relatedDocsPages('notebook erstellen');
    const urls = pages.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const page of pages) expect(page.url).not.toContain('#');
  });
});

describe('buildDocsPageMap', () => {
  it('lists every page with an absolute URL', () => {
    const map = buildDocsPageMap();
    for (const page of DOCS_PAGES) {
      expect(map).toContain(`${DOCS_SITE_URL}${page.url}`);
    }
  });

  it('stays small enough to inject into a system prompt', () => {
    // ~4 chars/token: the whole corpus map must stay in the low thousands of
    // tokens, otherwise it cannot ride along on every help turn.
    expect(buildDocsPageMap().length).toBeLessThan(24_000);
  });

  it('is stable across calls (cached)', () => {
    expect(buildDocsPageMap()).toBe(buildDocsPageMap());
  });
});
