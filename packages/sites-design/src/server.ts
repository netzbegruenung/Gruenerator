import { checkSiteHandle, type PublishedSiteSnapshot } from '@gruenerator/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { type SiteFontFile } from './model/fonts.js';
import { reportHref } from './model/links.js';
import { type SiteDocumentKind } from './model/meta.js';
import { sitePaths } from './model/paths.js';
import { visibleSections } from './model/visibility.js';
import { SiteDocument } from './document/SiteDocument.js';

export { siteFontFaceCss, siteFontFiles, siteFontPreloads } from './model/fonts.js';
export { sitePaths } from './model/paths.js';

export interface RenderSitePageInput {
  snapshot: PublishedSiteSnapshot;
  handle: string;
  document: SiteDocumentKind;
  origin: string;
  stylesheetHref: string;
  fontUrl: (file: SiteFontFile) => string;
  consentScriptSrc: string;
  reportEmail: string;
  robots: 'index' | 'noindex';
}

const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/;

export function renderSitePage(input: RenderSitePageInput): { html: string } {
  const { snapshot, handle, document, origin } = input;
  const checked = checkSiteHandle(handle);
  if (!checked.ok || checked.handle !== handle) throw new Error('invalid site handle');
  if (!ORIGIN.test(origin)) throw new Error('invalid origin');

  const paths = sitePaths(handle);
  const canonical = `${origin}${paths[document]}`;
  const withScript =
    document === 'home' && visibleSections(snapshot, 'public').includes('socialFeed');

  const markup = renderToStaticMarkup(
    createElement(SiteDocument, {
      snapshot,
      document,
      canonical,
      origin,
      links: { ...paths, report: reportHref(input.reportEmail, canonical) },
      stylesheetHref: input.stylesheetHref,
      fontUrl: input.fontUrl,
      consentScriptSrc: withScript ? input.consentScriptSrc : null,
      robots: input.robots,
    })
  );
  return { html: /^<!doctype html>/i.test(markup) ? markup : `<!DOCTYPE html>${markup}` };
}
