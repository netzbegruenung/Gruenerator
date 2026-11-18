/**
 * index.html is the link-preview fallback for every route without its own
 * crawler rewrite, and one image serves every instance. The tags in it stay
 * host-neutral; the nginx in apps/web/Dockerfile makes them absolute for the
 * requesting host with `sub_filter` (#5629). That coupling is a plain string
 * match on both sides — reformatting a meta tag would silently bring back the
 * relative og:image that WhatsApp and Signal drop. This test applies the
 * Dockerfile's substitutions to index.html and checks the result.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(import.meta.dirname, '../..');
const dockerfile = readFileSync(path.join(WEB_ROOT, 'Dockerfile'), 'utf8');
const indexHtml = readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');

const substitutions = [...dockerfile.matchAll(/^\s*sub_filter '([^']+)' '([^']+)';$/gm)].map(
  (m) => ({ from: m[1], to: m[2] })
);

function served(host: string): string {
  let html = indexHtml;
  for (const { from, to } of substitutions)
    html = html.replaceAll(from, to.replaceAll('$host', host));
  return html;
}

function metaContent(html: string, property: string): string[] {
  return [...html.matchAll(new RegExp(`property="${property}" content="([^"]*)"`, 'g'))].map(
    (m) => m[1]
  );
}

describe('generic OG fallback (index.html + apps/web/Dockerfile)', () => {
  it('turns every preview URL absolute for the requesting host', () => {
    const html = served('beta.gruenerator.eu');
    expect(metaContent(html, 'og:image')).toEqual(['https://beta.gruenerator.eu/og-image.png']);
    expect(metaContent(html, 'twitter:image')).toEqual([
      'https://beta.gruenerator.eu/og-image.png',
    ]);
    expect(metaContent(html, 'og:url')).toEqual(['https://beta.gruenerator.eu/']);
    expect(metaContent(html, 'twitter:url')).toEqual(['https://beta.gruenerator.eu/']);
  });

  it('keeps index.html itself free of any instance host', () => {
    for (const property of ['og:image', 'twitter:image', 'og:url', 'twitter:url']) {
      for (const value of metaContent(indexHtml, property)) expect(value).toMatch(/^\//);
    }
  });

  it('rewrites on every occurrence, not just the first', () => {
    expect(dockerfile).toMatch(/^\s*sub_filter_once off;$/m);
  });
});
