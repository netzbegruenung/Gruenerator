import { mkdirSync, writeFileSync } from 'node:fs';

import { type PublishedSiteSnapshot, type SupportedLocale } from '@gruenerator/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import { type LegalDocumentKind } from '../src/legal/types.js';
import { SITE_BUNDLED_FONT_FILES, siteFontFaceCss, type SiteFontFile } from '../src/model/fonts.js';
import { type SiteLinks, sitePaths } from '../src/model/paths.js';
import { siteRootAttributes } from '../src/model/root.js';
import { SiteBody } from '../src/site/SiteBody.js';
import { SiteLegalBody } from '../src/site/SiteLegalBody.js';
import { fullSnapshot, maxSnapshot, minimalSnapshot } from '../src/testing/fixtures.js';

const OUT = new URL('../dist/fixtures/', import.meta.url);
const IMAGE = process.env['SITE_FIXTURE_IMAGE'] ?? '';
const links: SiteLinks = { ...sitePaths('anna'), report: 'mailto:melden@example.org' };

const bundled = new Set<string>(SITE_BUNDLED_FONT_FILES);
const fontUrl = (file: SiteFontFile) =>
  bundled.has(file) ? `/assets/fonts/${file}` : `/dist/intern-fonts/${file}`;

function withImage(s: PublishedSiteSnapshot): PublishedSiteSnapshot {
  if (IMAGE === '') return s;
  const img = (url: string) => (url === '' ? url : IMAGE);
  const { sections } = s;
  return {
    ...s,
    profile_image: img(s.profile_image),
    sections: {
      ...sections,
      ...(sections.heroImage
        ? { heroImage: { ...sections.heroImage, imageUrl: img(sections.heroImage.imageUrl) } }
        : {}),
      ...(sections.themes
        ? { themes: sections.themes.map((t) => ({ ...t, imageUrl: img(t.imageUrl) })) }
        : {}),
      ...(sections.actions
        ? { actions: sections.actions.map((a) => ({ ...a, imageUrl: img(a.imageUrl) })) }
        : {}),
      ...(sections.contact
        ? {
            contact: {
              ...sections.contact,
              backgroundImageUrl: img(sections.contact.backgroundImageUrl),
            },
          }
        : {}),
    },
  };
}

function page(s: PublishedSiteSnapshot, document: LegalDocumentKind | null): string {
  const snapshot = withImage(s);
  const body =
    document === null ? (
      <SiteBody snapshot={snapshot} links={links} mode="public" />
    ) : (
      <SiteLegalBody snapshot={snapshot} links={links} document={document} />
    );
  return `<!doctype html>${renderToStaticMarkup(
    <html {...siteRootAttributes(snapshot)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{snapshot.site_title}</title>
        <link rel="stylesheet" href="/dist/site.css" />
        <style>{siteFontFaceCss(snapshot.locale, fontUrl)}</style>
      </head>
      <body>{body}</body>
    </html>
  )}`;
}

const files: [string, string][] = [];
for (const variant of ['dunkel', 'hell', 'leuchtend'] as const)
  for (const locale of ['de-DE', 'de-AT'] as const satisfies readonly SupportedLocale[])
    files.push([`${variant}-${locale}.html`, page(fullSnapshot({ variant, locale }), null)]);
files.push(['max-de-DE.html', page(maxSnapshot(), null)]);
files.push(['minimal-de-AT.html', page(minimalSnapshot('de-AT'), null)]);
for (const variant of ['dunkel', 'hell', 'leuchtend'] as const)
  for (const locale of ['de-DE', 'de-AT'] as const) {
    files.push([
      `max-${variant}-${locale}.html`,
      page({ ...maxSnapshot(), variant, locale }, null),
    ]);
    files.push([
      `minimal-${variant}-${locale}.html`,
      page({ ...minimalSnapshot(locale), variant }, null),
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
