import { readFileSync } from 'node:fs';

import { GRUENE_AT, GRUENE_DE, HELLGRUEN_GLOW } from '@gruenerator/contracts/brand';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

const LOCALES = ['de-DE', 'de-AT'] as const;
const SOLID = ['paper', 'surface', 'deep', 'deeper', 'vivid'] as const;
type Locale = (typeof LOCALES)[number];

function rules(css: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? '').trim().replace(/'/g, '"');
    const decls: Record<string, string> = {};
    for (const d of (m[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
      decls[d[1] ?? ''] = (d[2] ?? '').trim();
    out.set(selector, { ...out.get(selector), ...decls });
  }
  return out;
}

const layer = tokensCss.slice(tokensCss.indexOf('@layer base'));
const ruleMap = rules(layer.slice(layer.indexOf('{') + 1));

function palette(locale: Locale): Record<string, string> {
  const base = ruleMap.get(':root') ?? {};
  const merged =
    locale === 'de-AT' ? { ...base, ...ruleMap.get(':root[data-site-locale="de-AT"]') } : base;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) out[k.replace('--site-palette-', '')] = v;
  return out;
}

function resolveGround(locale: Locale, ground: string) {
  const p = palette(locale);
  const roles = ruleMap.get(`[data-ground="${ground}"]`) ?? {};
  const t: Record<string, string> = {};
  for (const [k, v] of Object.entries(roles)) {
    const name = /var\(--site-palette-([\w-]+)\)/.exec(v)?.[1] ?? '';
    t[k.replace('--site-color-', '')] = p[name] ?? '';
  }
  const scrimMix = /color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, transparent\)/i.exec(
    p['scrim'] ?? ''
  );
  return {
    ...t,
    scrim: scrimMix?.[1] ?? '',
    scrimAlpha: Number(scrimMix?.[2] ?? 0) / 100,
  } as Record<string, string> & { scrim: string; scrimAlpha: number };
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function over(color: string, alpha: number, base: string): string {
  const c = channels(color);
  const b = channels(base);
  const mixed = c.map((v, i) => Math.round(v * alpha + (b[i] ?? 0) * (1 - alpha)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

describe('site tokens', () => {
  it('uses only colours from the brand packs', () => {
    const allowed = new Set(
      (JSON.stringify([GRUENE_DE, GRUENE_AT, HELLGRUEN_GLOW]).match(/#[0-9a-f]{6}/gi) ?? []).map(
        (h) => h.toLowerCase()
      )
    );
    const used = (tokensCss.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toLowerCase());
    expect(used.length).toBeGreaterThan(15);
    expect(used.filter((h) => !allowed.has(h))).toEqual([]);
  });
  it.each(LOCALES.flatMap((l) => SOLID.map((g) => [l, g] as const)))(
    '%s %s meets the contrast floors',
    (locale, ground) => {
      const t = resolveGround(locale, ground);
      expect(contrast(t['ink'] ?? '', t['ground'] ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['link'] ?? '', t['ground'] ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['action-ink'] ?? '', t['action'] ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['heading'] ?? '', t['ground'] ?? '')).toBeGreaterThanOrEqual(3);
      expect(contrast(t['accent'] ?? '', t['ground'] ?? '')).toBeGreaterThanOrEqual(3);
      expect(contrast(t['focus'] ?? '', t['ground'] ?? '')).toBeGreaterThanOrEqual(3);
    }
  );
  it.each(LOCALES)('%s photo scrim keeps white text at 4.5:1 over a white image', (locale) => {
    const t = resolveGround(locale, 'photo');
    const behind = over(t.scrim, t.scrimAlpha, '#ffffff');
    expect(contrast(t['ink'] ?? '', behind)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['accent'] ?? '', behind)).toBeGreaterThanOrEqual(3);
  });
  it.each(LOCALES)('%s Störer ink meets 3:1 (large text only)', (locale) => {
    const t = resolveGround(locale, 'paper');
    expect(contrast(t['signal-ink'] ?? '', t['signal'] ?? '')).toBeGreaterThanOrEqual(3);
  });
});
