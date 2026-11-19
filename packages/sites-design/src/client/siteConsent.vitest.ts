// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { InstagramConsent } from '../site/InstagramConsent.js';

import { initSiteConsent } from './siteConsent.js';

const KEY = 'gruenerator-sites-embed-consent';
let store: Map<string, string>;
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

function click(selector: string) {
  document.querySelector<HTMLElement>(selector)?.click();
}
function check(selector: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (input) input.checked = true;
}

beforeEach(() => {
  store = new Map();
  document.body.innerHTML = renderToStaticMarkup(
    createElement(InstagramConsent, { username: 'max.muster', loaded: false })
  );
  document.documentElement.removeAttribute('data-site-consent-ready');
  initSiteConsent(document, storage);
});

describe('initSiteConsent', () => {
  it('loads the embed on click and hides the prompt', () => {
    click('[data-consent-load]');
    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('https://www.instagram.com/max.muster/embed');
    expect(document.querySelector('[data-consent-prompt]')?.hasAttribute('hidden')).toBe(true);
  });

  it('remembers the choice only when asked', () => {
    click('[data-consent-load]');
    expect(store.get(KEY)).toBeUndefined();
    document.documentElement.removeAttribute('data-site-consent-ready');
    document.body.innerHTML = renderToStaticMarkup(
      createElement(InstagramConsent, { username: 'max.muster', loaded: false })
    );
    initSiteConsent(document, storage);
    check('[data-consent-remember]');
    click('[data-consent-load]');
    expect(JSON.parse(storage.getItem(KEY) ?? '{}').instagram).toMatchObject({
      granted: true,
      remember: true,
    });
  });

  it('loads at once with a stored consent', () => {
    storage.setItem(KEY, JSON.stringify({ instagram: { granted: true, remember: true } }));
    document.documentElement.removeAttribute('data-site-consent-ready');
    initSiteConsent(document, storage);
    expect(document.querySelector('iframe')).not.toBeNull();
  });

  it('refuses a tampered embed URL', () => {
    document
      .querySelector('[data-site-consent]')
      ?.setAttribute('data-embed-src', 'javascript:alert(1)');
    click('[data-consent-load]');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('does not attach twice', () => {
    initSiteConsent(document, storage);
    click('[data-consent-load]');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('works without storage', () => {
    document.documentElement.removeAttribute('data-site-consent-ready');
    document.body.innerHTML = renderToStaticMarkup(
      createElement(InstagramConsent, { username: 'max.muster', loaded: false })
    );
    initSiteConsent(document, null);
    click('[data-consent-load]');
    expect(document.querySelector('iframe')).not.toBeNull();
  });
});
