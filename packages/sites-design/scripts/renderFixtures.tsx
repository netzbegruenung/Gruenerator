import { mkdirSync, writeFileSync } from 'node:fs';

import { type PublishedSiteSnapshot, type SupportedLocale } from '@gruenerator/contracts';

import { SITE_BUNDLED_FONT_FILES, type SiteFontFile } from '../src/model/fonts.js';
import { type SiteDocumentKind } from '../src/model/meta.js';
import { renderSitePage } from '../src/server.js';
import { fullSnapshot, maxSnapshot, minimalSnapshot } from '../src/testing/fixtures.js';

const OUT = new URL('../dist/fixtures/', import.meta.url);
const IMAGE = process.env['SITE_FIXTURE_IMAGE'] ?? '';

const bundled = new Set<string>(SITE_BUNDLED_FONT_FILES);
const fontUrl = (file: SiteFontFile) =>
  bundled.has(file) ? `/assets/fonts/${file}` : `/dist/intern-fonts/${file}`;

function withImage(s: PublishedSiteSnapshot): PublishedSiteSnapshot {
  if (IMAGE === '') return s;
  const img = (url: string) => (url === '' ? url : IMAGE);
  const blocks = s.sections.blocks.map((block) => {
    switch (block.type) {
      case 'heroImage':
        return { ...block, imageUrl: img(block.imageUrl) };
      case 'themes':
      case 'actions':
        return {
          ...block,
          items: block.items.map((item) => ({ ...item, imageUrl: img(item.imageUrl) })),
        } as typeof block;
      case 'contact':
        return { ...block, backgroundImageUrl: img(block.backgroundImageUrl) };
      default:
        return block;
    }
  });
  return { ...s, profile_image: img(s.profile_image), sections: { ...s.sections, blocks } };
}

function page(s: PublishedSiteSnapshot, document: SiteDocumentKind): string {
  return renderSitePage({
    snapshot: withImage(s),
    handle: 'anna',
    document,
    origin: 'http://localhost:4310',
    stylesheetHref: '/dist/site.css',
    fontUrl,
    consentScriptSrc: '/dist/client/siteConsent.js',
    reportEmail: 'melden@example.org',
    robots: 'noindex',
  }).html;
}

const files: [string, string][] = [];
for (const variant of ['dunkel', 'hell', 'leuchtend'] as const)
  for (const locale of ['de-DE', 'de-AT'] as const satisfies readonly SupportedLocale[])
    files.push([`${variant}-${locale}.html`, page(fullSnapshot({ variant, locale }), 'home')]);
files.push(['max-de-DE.html', page(maxSnapshot(), 'home')]);
files.push(['minimal-de-AT.html', page(minimalSnapshot('de-AT'), 'home')]);
for (const variant of ['dunkel', 'hell', 'leuchtend'] as const)
  for (const locale of ['de-DE', 'de-AT'] as const) {
    files.push([
      `max-${variant}-${locale}.html`,
      page({ ...maxSnapshot(), variant, locale }, 'home'),
    ]);
    files.push([
      `minimal-${variant}-${locale}.html`,
      page({ ...minimalSnapshot(locale), variant }, 'home'),
    ]);
  }
files.push(['impressum-de-DE.html', page(fullSnapshot(), 'impressum')]);
files.push(['datenschutz-de-AT.html', page(fullSnapshot({ locale: 'de-AT' }), 'datenschutz')]);

const index = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fixtures</title></head><body><ul>${files
  .map(([name]) => `<li><a href="${name}">${name}</a></li>`)
  .join('')}</ul></body></html>`;

mkdirSync(OUT, { recursive: true });
for (const [name, html] of files) writeFileSync(new URL(name, OUT), html);
writeFileSync(new URL('index.html', OUT), index);
console.log(`wrote ${files.length + 1} files to ${OUT.pathname}`);
