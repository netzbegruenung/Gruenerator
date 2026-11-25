import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type SiteBlock } from '@gruenerator/contracts';

import { SWATCH_PALETTES, variantPreview } from './swatches.js';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--site-palette-([\w-]+)\s*:\s*([^;]+);/g))
    out[m[1] ?? ''] = (m[2] ?? '').trim();
  return out;
}

describe('variantPreview', () => {
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
    expect(css_['scrim']).toContain(p.scrim);
    // The Austrian tint is a color-mix in the CSS; the mirror holds its computed value.
    if (locale === 'de-DE') expect(p.tint).toBe(css_['tint']);
    else expect(css_['tint']).toBe('color-mix(in srgb, #56af31 15%, #ffffff)');
  });

  const blocks = [
    { id: 'h', type: 'hero' },
    { id: 'a', type: 'about' },
    { id: 'x', type: 'themes', hidden: true },
    { id: 'c', type: 'contact', backgroundImageUrl: '' },
  ] as SiteBlock[];

  const colours = (...args: Parameters<typeof variantPreview>) =>
    variantPreview(...args).map((band) => band.colour);

  it('paints header, each shown block and footer as the page does', () => {
    expect(variantPreview(blocks, false, 'dunkel', 'de-DE').map((band) => band.key)).toEqual([
      'header',
      'h',
      'a',
      'c',
      'footer',
    ]);
    expect(colours(blocks, false, 'dunkel', 'de-DE')).toEqual([
      '#ffffff',
      '#005538',
      '#ffffff',
      '#005538',
      '#00261a',
    ]);
    expect(colours(blocks, false, 'leuchtend', 'de-DE')[1]).toBe('#00cc4f');
    expect(colours(blocks, false, 'hell', 'de-DE')[1]).toBe('#f5f1e9');
    expect(colours(blocks, false, 'hell', 'de-AT')[2]).toBe('#e6f3e0');
  });

  it('shows the full-bleed hero as its photo, or deep green without a portrait', () => {
    const full = [{ id: 'h', type: 'hero', layout: 'vollbild' }] as SiteBlock[];
    expect(colours(full, true, 'hell', 'de-DE')[1]).toBe('#00261a');
    expect(colours(full, false, 'hell', 'de-DE')[1]).toBe('#005538');
  });
});
