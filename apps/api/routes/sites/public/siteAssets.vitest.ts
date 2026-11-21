import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { siteFontFaceCss } from '@gruenerator/sites-design/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ gotham: '', neue: '' }));

vi.mock('../../../services/fonts/brandFonts.js', () => ({
  brandFontPath: (file: string) => (file === 'GothamNarrow-Book.woff2' ? state.gotham : state.neue),
}));

import {
  createSiteAssets,
  siteFontUrl,
  type SiteAssets,
  type SiteAssetPaths,
} from './siteAssets.js';
import { cspHash, siteCsp } from './siteSecurity.js';

const sha256hex = (text: string) => createHash('sha256').update(text).digest('hex');

describe('site assets', () => {
  let dir: string;
  let paths: SiteAssetPaths;
  let assets: SiteAssets;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'site-assets-'));
    mkdirSync(join(dir, 'fonts'));
    writeFileSync(join(dir, 'site.css'), 'a{}');
    writeFileSync(join(dir, 'consent.js'), 'x');
    writeFileSync(join(dir, 'fonts/PTSans-Regular.woff2'), 'f');
    state.gotham = join(dir, 'gotham.woff2');
    writeFileSync(state.gotham, 'g');
    state.neue = join(dir, 'missing.woff2');
    paths = {
      css: join(dir, 'site.css'),
      consent: join(dir, 'consent.js'),
      bundledFontsDir: join(dir, 'fonts'),
    };
    assets = createSiteAssets(paths);
  });

  it('versions the stylesheet by its content', () => {
    expect(assets.stylesheet.version).toBe(sha256hex('a{}').slice(0, 12));
    expect(assets.stylesheet.href).toBe(`/_site/site.${assets.stylesheet.version}.css`);
    expect(assets.consent.href).toMatch(/^\/_site\/consent\.[0-9a-f]{12}\.js$/);
  });

  it('missing dist files fail at creation', () =>
    expect(() => createSiteAssets({ ...paths, css: '/nope.css' })).toThrow());

  it('resolves bundled and brand fonts of the site set', () => {
    expect(assets.fontPath('PTSans-Regular.woff2')).toBe(join(dir, 'fonts/PTSans-Regular.woff2'));
    expect(assets.fontPath('GothamNarrow-Book.woff2')).toBe(state.gotham);
  });

  it('a missing brand font resolves to null', () =>
    expect(assets.fontPath('GrueneTypeNeue-Regular.woff2')).toBeNull());

  it('files outside the site set resolve to null', () => {
    for (const f of [
      '../site.css',
      'Foo.woff2',
      'GrueneType.woff2',
      'GothamNarrow-Ultra.ttf',
      'PTSans-Regular.woff2/',
    ])
      expect(assets.fontPath(f)).toBeNull();
  });

  it('hashes the exact font-face css per locale', () => {
    expect(assets.styleHash('de-DE')).toBe(cspHash(siteFontFaceCss('de-DE', siteFontUrl)));
    expect(assets.styleHash('de-AT')).not.toBe(assets.styleHash('de-DE'));
  });

  it('the site CSP allows no inline script and only the hashed style', () => {
    const csp = siteCsp("'sha256-abc'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self' 'sha256-abc';");
    expect(csp).not.toContain('unsafe-');
    expect(csp).toContain('frame-src https://www.instagram.com;');
  });
});
