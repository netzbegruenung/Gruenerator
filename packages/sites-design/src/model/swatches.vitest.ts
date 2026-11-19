import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SWATCH_PALETTES, variantSwatches } from './swatches.js';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--site-palette-([\w-]+)\s*:\s*([^;]+);/g))
    out[m[1] ?? ''] = (m[2] ?? '').trim();
  return out;
}

describe('variantSwatches', () => {
  it.each([
    ['de-DE', ':root'],
    ['de-AT', ":root[data-site-locale='de-AT']"],
  ] as const)('palette for %s matches tokens.css', (locale, selector) => {
    const css_ = { ...block(':root'), ...(locale === 'de-AT' ? block(selector) : {}) };
    const p = SWATCH_PALETTES[locale];
    expect(p.paper).toBe(css_['paper']);
    expect(p.surface).toBe(css_['surface']);
    expect(p.deep).toBe(css_['deep']);
    expect(p.deeper).toBe(css_['deeper']);
    expect(p.vivid).toBe(css_['vivid']);
    expect(p.highlight).toBe(css_['highlight']);
    expect(p.accentLight).toBe(css_['accent-light']);
    expect(p.vividAccent).toBe(css_['vivid-accent']);
    expect(css_['scrim']).toContain(p.scrim);
  });

  it('follows the ground table and differs between locales', () => {
    expect(variantSwatches('dunkel', 'de-DE').hero.ground).toBe('#005538');
    expect(variantSwatches('leuchtend', 'de-DE').hero.ground).toBe('#00cc4f');
    expect(variantSwatches('hell', 'de-DE').hero.ground).toBe('#f5f1e9');
    expect(variantSwatches('dunkel', 'de-AT').hero.ground).toBe('#257639');
  });
});
