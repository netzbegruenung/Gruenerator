// @vitest-environment jsdom
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { renderSitePage } from '../server.js';
import { fullSnapshot, maxSnapshot } from '../testing/fixtures.js';

const cases = [
  ['home dunkel de-DE', 'home', fullSnapshot({ variant: 'dunkel', locale: 'de-DE' })],
  ['home leuchtend de-AT', 'home', fullSnapshot({ variant: 'leuchtend', locale: 'de-AT' })],
  ['home max', 'home', maxSnapshot()],
  ['impressum de-DE', 'impressum', fullSnapshot({ locale: 'de-DE' })],
  ['datenschutz de-AT', 'datenschutz', fullSnapshot({ locale: 'de-AT' })],
] as const;

describe('accessibility', () => {
  it.each(cases)('%s has no axe violations', async (_name, document, snapshot) => {
    const { html } = renderSitePage({
      snapshot,
      handle: 'anna',
      document,
      origin: 'https://grsites.de',
      stylesheetHref: '/_site/site.css',
      fontUrl: (f) => `/api/fonts/${f}`,
      consentScriptSrc: '/_site/consent.js',
      reportEmail: 'melden@example.org',
      robots: 'noindex',
    });
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    window.document.replaceChild(
      window.document.importNode(parsed.documentElement, true),
      window.document.documentElement
    );
    const result = await axe.run(window.document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
    expect(result.passes.length).toBeGreaterThan(20);
  });
});
