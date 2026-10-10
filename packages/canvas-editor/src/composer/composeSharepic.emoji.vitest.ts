import {
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
  sharepicSpecSchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getAssetById } from '../utils/canvasAssets';

import { applySharepicPatch } from './applySharepicPatch';
import { composeSharepic } from './composeSharepic';
import { options } from './sharepicSpecFixtures';
import { applySharepicTweaks, sharepicTweaks } from './sharepicTweaks';

type Locale = SharepicSpec['locale'];
const slide = (items: SharepicItem[], locale: Locale = 'de-AT'): SharepicSlide => ({
  background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
  position: 'mitte',
  align: 'links',
  items,
  logo: false,
});
const spec = (items: SharepicItem[], locale: Locale = 'de-AT'): SharepicSpec => ({
  locale,
  slides: [slide(items, locale)],
});
const liste: SharepicItem = {
  type: 'liste',
  stil: 'emoji',
  items: ['Nutze dein **Wahlrecht**', 'Besuche **Demos**', 'Unterschreibe **Petitionen**'],
  zeichen: ['🗳️', '🪧', '✍️'],
};

describe('liste stil emoji — schema', () => {
  it('takes one emoji per point', () => {
    expect(sharepicSpecSchema.safeParse(spec([liste])).success).toBe(true);
  });

  it('reads an emoji written without its variation selector', () => {
    const parsed = sharepicSpecSchema.parse(spec([{ ...liste, zeichen: ['🗳', '🪧', '✍'] }]));
    const item = parsed.slides[0]!.items[0]!;
    expect(item.type === 'liste' && item.zeichen).toEqual(['🗳️', '🪧', '✍️']);
  });

  it('refuses a missing, extra or unknown emoji', () => {
    expect(sharepicSpecSchema.safeParse(spec([{ ...liste, zeichen: ['🗳️', '🪧'] }])).success).toBe(
      false
    );
    const { zeichen: _, ...bare } = liste as Extract<SharepicItem, { type: 'liste' }>;
    expect(sharepicSpecSchema.safeParse(spec([bare])).success).toBe(false);
    expect(
      sharepicSpecSchema.safeParse(spec([{ ...liste, zeichen: ['🗳️', '🪧', '🍕'] }])).success
    ).toBe(false);
  });

  it('allows zeichen only on an emoji list', () => {
    expect(sharepicSpecSchema.safeParse(spec([{ ...liste, stil: 'punkte' }])).success).toBe(false);
  });

  it('works in both corporate designs', () => {
    expect(sharepicSpecSchema.safeParse(spec([liste], 'de-DE')).success).toBe(true);
  });
});

describe('liste stil emoji — composer', () => {
  for (const locale of ['de-DE', 'de-AT'] as const) {
    it(`sets an emoji image left of each point (${locale})`, () => {
      const page = composeSharepic(spec([liste], locale), options).slides[0]!;
      const emoji = page.assetInstances.filter((a) => a.id.endsWith('-zeichen'));
      expect(emoji.map((a) => a.assetId)).toEqual(['emoji-1f5f3', 'emoji-1faa7', 'emoji-270d']);
      for (const a of emoji) {
        expect(getAssetById(a.assetId)?.src).toMatch(/^\/emoji\/emoji_u[0-9a-f_]+\.svg$/);
        expect(page.layerOrder).toContain(a.id);
      }
      const points = page.additionalTexts.filter((t) => /-\d$/.test(t.id));
      expect(points.map((p) => p.text)).toEqual((liste as { items: string[] }).items);
      // No text marker: the emoji is the marker.
      expect(page.additionalTexts.some((t) => t.id.endsWith('-marker'))).toBe(false);
      points.forEach((p, k) => {
        const e = emoji[k]!;
        const side = e.scale * 150;
        expect(p.x).toBeGreaterThan(e.x + side / 2);
        // The first line sits on the emoji's middle.
        const firstLine = p.y + (p.fontSize * 1.25) / 2;
        expect(Math.abs(firstLine - e.y)).toBeLessThan(2);
        // Sized from the text, larger than it.
        expect(side).toBeGreaterThan(p.fontSize * 1.3);
        expect(side).toBeLessThan(p.fontSize * 2.5);
      });
      // Rows do not overlap.
      for (let k = 1; k < emoji.length; k++) {
        expect(emoji[k]!.y - emoji[k - 1]!.y).toBeGreaterThan(emoji[k]!.scale * 150);
      }
    });
  }

  it('puts the DE list on its white card, the AT one straight on the green', () => {
    const de = composeSharepic(spec([liste], 'de-DE'), options).slides[0]!;
    const at = composeSharepic(spec([liste], 'de-AT'), options).slides[0]!;
    expect(de.shapeInstances.some((s) => s.id.endsWith('-card'))).toBe(true);
    expect(at.shapeInstances.some((s) => s.id.endsWith('-card'))).toBe(false);
  });

  it('works on a photo', () => {
    const page = composeSharepic(
      {
        locale: 'de-AT',
        slides: [
          {
            ...slide([liste]),
            background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
          },
        ],
      },
      options
    ).slides[0]!;
    expect(page.assetInstances.filter((a) => a.id.endsWith('-zeichen'))).toHaveLength(3);
  });
});

describe('liste stil emoji — tweaks and text edits', () => {
  it('offers emoji only to a list that has its emoji', () => {
    const plain = spec([{ type: 'liste', items: ['Bus', 'Bahn'] }]);
    const values = (s: SharepicSpec) =>
      sharepicTweaks(s, {})
        .find((t) => t.id === 'liste')!
        .options.map((o) => o.value);
    expect(values(plain)).not.toContain('emoji');
    expect(values(spec([liste]))).toContain('emoji');
  });

  it('drops the emoji for another stil and brings them back', () => {
    const base = spec([liste]);
    const ticks = applySharepicTweaks(base, { liste: 'haken' });
    expect(sharepicSpecSchema.safeParse(ticks).success).toBe(true);
    expect(JSON.stringify(ticks)).not.toContain('zeichen');
    const back = applySharepicTweaks(base, { liste: 'emoji' });
    expect(back).toEqual(base);
  });

  it('keeps the emoji through a text edit only with one line per emoji', () => {
    const base = spec([liste]);
    const set = (text: string) =>
      applySharepicPatch(base, [{ op: 'set_text', slide: 0, item: 0, text }]);
    const same = set('Geh wählen\nGeh demonstrieren\nUnterschreibe');
    expect(same.skipped).toEqual([]);
    const item = same.spec.slides[0]!.items[0]!;
    expect(item.type === 'liste' && item.zeichen).toEqual(['🗳️', '🪧', '✍️']);
    expect(set('Geh wählen\nGeh demonstrieren').skipped).toHaveLength(1);
  });
});
