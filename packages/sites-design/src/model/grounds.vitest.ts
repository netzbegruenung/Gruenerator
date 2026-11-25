import { type SiteBlock } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { blockGrounds, blockOnPhoto } from './grounds.js';

const grounds = (blocks: SiteBlock[], locale: 'de-DE' | 'de-AT' = 'de-DE') => [
  ...blockGrounds(blocks, 'dunkel', locale, false).values(),
];

describe('blockGrounds with a chosen background', () => {
  it('takes the chosen background over the variant, per country', () => {
    const blocks = [
      { id: 'h', type: 'hero' },
      { id: 'a', type: 'about', background: 'hell' },
    ] as SiteBlock[];
    // Variant dunkel puts about on paper; "hell" is cream in Germany, the tint in Austria.
    expect(grounds(blocks)).toEqual(['deep', 'surface']);
    expect(grounds(blocks, 'de-AT')).toEqual(['deep', 'tint']);
  });

  it('keeps a chosen background as chosen, also next to the same choice', () => {
    const blocks = [
      { id: 'h', type: 'hero', background: 'dunkel' },
      { id: 'a', type: 'about', background: 'dunkel' },
    ] as SiteBlock[];
    expect(grounds(blocks)).toEqual(['deep', 'deep']);
  });

  it('moves the automatic block above aside instead of the chosen one', () => {
    const blocks = [
      { id: 'h', type: 'hero' },
      { id: 'a', type: 'about', background: 'dunkel' },
    ] as SiteBlock[];
    expect(grounds(blocks)).toEqual(['deeper', 'deep']);
  });

  it('moves an automatic block aside from a chosen background below it', () => {
    // dunkel: themes sits on surface; about below is chosen as cream (surface) too.
    const blocks = [
      { id: 'h', type: 'hero' },
      { id: 't', type: 'themes', items: [] },
      { id: 'a', type: 'about', background: 'hell' },
    ] as SiteBlock[];
    expect(grounds(blocks)).toEqual(['deep', 'paper', 'surface']);
  });

  it('keeps the block above apart when both sides cannot be', () => {
    // about is paper; above is paper, below chosen cream: Germany has no third light ground.
    const blocks = [
      { id: 'h', type: 'hero', background: 'weiss' },
      { id: 'a', type: 'about' },
      { id: 't', type: 'themes', items: [], background: 'hell' },
    ] as SiteBlock[];
    expect(grounds(blocks)).toEqual(['paper', 'surface', 'surface']);
  });

  it('ignores hidden blocks as the neighbour below', () => {
    const blocks = [
      { id: 'h', type: 'hero' },
      { id: 't', type: 'themes', items: [] },
      { id: 'x', type: 'about', hidden: true, background: 'hell' },
    ] as SiteBlock[];
    expect(grounds(blocks)).toEqual(['deep', 'surface', 'surface']);
  });

  it('lets a photo win over the chosen background', () => {
    const contact = {
      id: 'c',
      type: 'contact',
      title: '',
      backgroundImageUrl: 'https://example.org/a.jpg',
      background: 'weiss',
    } as SiteBlock;
    expect(blockOnPhoto(contact, false)).toBe(true);
    expect(grounds([{ id: 'h', type: 'hero' } as SiteBlock, contact])).toEqual(['deep', 'photo']);
    // A banner without its image takes the chosen background instead of the deep green.
    const banner = { id: 'b', type: 'heroImage', imageUrl: '', background: 'hell' } as SiteBlock;
    expect(blockOnPhoto(banner, false)).toBe(false);
    expect(grounds([{ id: 'h', type: 'hero' } as SiteBlock, banner])).toEqual(['deep', 'surface']);
  });

  it('treats the full-bleed hero as a photo only with a portrait', () => {
    const hero = { id: 'h', type: 'hero', layout: 'vollbild', background: 'hell' } as SiteBlock;
    expect(blockOnPhoto(hero, true)).toBe(true);
    expect(blockOnPhoto(hero, false)).toBe(false);
    expect(grounds([hero])).toEqual(['surface']);
  });
});
