import { describe, expect, it } from 'vitest';

import {
  defaultSiteBlock,
  defaultSiteBlocks,
  SITE_BLOCK_TYPES,
  SITE_BLOCKS_MAX,
  siteBlockSpec,
  siteSectionsSchema,
  type SiteBlock,
} from './sites.js';

function ids() {
  let n = 0;
  return () => `b${(n += 1)}`;
}

const page = (...blocks: SiteBlock[]) => siteSectionsSchema.safeParse({ blocks });
const messages = (result: ReturnType<typeof page>) =>
  result.success ? [] : result.error.issues.map((issue) => issue.message);

describe('site block registry', () => {
  it('lists the seven types with their limits', () => {
    expect(SITE_BLOCK_TYPES.map((spec) => spec.type)).toEqual([
      'hero',
      'about',
      'heroImage',
      'themes',
      'actions',
      'socialFeed',
      'contact',
    ]);
    expect(siteBlockSpec('hero')).toMatchObject({ max: 1, pinned: true, itemMax: null });
    expect(siteBlockSpec('contact').max).toBe(1);
    expect(siteBlockSpec('socialFeed').max).toBe(1);
    expect(siteBlockSpec('themes')).toMatchObject({ max: null, itemMax: 6, pinned: false });
    expect(siteBlockSpec('actions').itemMax).toBe(6);
    expect(SITE_BLOCKS_MAX).toBe(20);
  });
});

describe('default page', () => {
  it('has the seven blocks in the standard order with distinct ids', () => {
    const blocks = defaultSiteBlocks(ids());
    expect(blocks.map((block) => block.type)).toEqual([
      'hero',
      'about',
      'heroImage',
      'themes',
      'actions',
      'socialFeed',
      'contact',
    ]);
    expect(new Set(blocks.map((block) => block.id)).size).toBe(7);
    expect(page(...blocks).success).toBe(true);
  });

  it('keeps the default texts', () => {
    const next = ids();
    expect(defaultSiteBlock('about', next)).toMatchObject({ title: 'Wer ich bin' });
    expect(defaultSiteBlock('heroImage', next)).toMatchObject({
      title: 'Gemeinsam für eine nachhaltige Zukunft!',
      imageUrl: '',
      subtitle: '',
    });
    expect(defaultSiteBlock('contact', next)).toMatchObject({ title: 'Kontakt' });
    expect(defaultSiteBlock('socialFeed', next)).toMatchObject({
      title: 'Instagram',
      instagramUsername: '',
      showFeed: false,
    });
  });
});

describe('page rules', () => {
  const next = ids();
  const hero = defaultSiteBlock('hero', next);
  const about = defaultSiteBlock('about', next);

  it('wants the hero on top', () => {
    expect(messages(page(about, hero))).toContain('Profil muss oben stehen');
    expect(messages(page(about))).toContain('Profil muss oben stehen');
  });

  it('allows one contact block but several theme blocks', () => {
    const contact = () => defaultSiteBlock('contact', next);
    expect(page(hero, contact(), contact()).success).toBe(false);
    const themes = () => defaultSiteBlock('themes', next);
    expect(page(hero, themes(), themes()).success).toBe(true);
  });

  it('caps the page at twenty blocks', () => {
    const many = Array.from({ length: SITE_BLOCKS_MAX }, () => defaultSiteBlock('about', next));
    expect(page(hero, ...many).success).toBe(false);
  });

  it('rejects an item id used in two blocks', () => {
    const item = { id: 'card', title: 'A', imageUrl: '', content: { type: 'doc' as const } };
    const a = { ...defaultSiteBlock('themes', next), items: [item] };
    const b = { ...defaultSiteBlock('themes', next), items: [item] };
    expect(messages(page(hero, a, b))).toContain('Kennung doppelt vergeben');
  });

  it('caps a theme block at six cards', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `card-${i}`,
      title: 'A',
      imageUrl: '',
      content: { type: 'doc' as const },
    }));
    expect(page(hero, { ...defaultSiteBlock('themes', next), items }).success).toBe(false);
  });
});
