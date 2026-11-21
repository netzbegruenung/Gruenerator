import { describe, expect, it } from 'vitest';

import {
  fullSnapshot,
  maxSnapshot,
  minimalSnapshot,
  withBlock,
  withBlocks,
} from '../testing/fixtures.js';

import { siteCopy } from './copy.js';
import { sectionGround } from './grounds.js';
import { focusClass, siteImageAttrs, sizedSrc } from './images.js';
import { reportHref, safeHref, telHref } from './links.js';
import { siteMeta } from './meta.js';
import { sitePaths } from './paths.js';
import { siteRootAttributes } from './root.js';
import { blockAnchors, visibleBlocks } from './visibility.js';

describe('safeHref', () => {
  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    '//evil.example',
    'https://user:pw@example.org',
    'mailto:a b@example.org',
    'tel:12',
    '#Kontakt',
    '',
  ])('refuses %j', (v) => expect(safeHref(v)).toBeNull());
  it.each([
    'https://gruene.de/mitmachen',
    'http://example.org',
    'mailto:a@b.de',
    'tel:+4930123',
    '#kontakt',
  ])('keeps %s', (v) => expect(safeHref(v)).toBe(v));
  it('builds a tel link from a formatted number', () =>
    expect(telHref('+49 (30) 123-45')).toBe('tel:+493012345'));
  it('refuses a short phone number', () => expect(telHref('12')).toBeNull());
});

describe('images', () => {
  it('sizes a media preview', () =>
    expect(sizedSrc('/api/share/abcdef123/preview', 800, 'webp')).toBe(
      '/api/share/abcdef123/preview?w=800&fmt=webp'
    ));
  it.each(['/api/share/abcdef123/download', 'https://x.de/a.png'])('leaves %s alone', (url) =>
    expect(sizedSrc(url, 400, 'webp')).toBe(url)
  );
  it('sizes a stock image', () =>
    expect(sizedSrc('/api/image-picker/stock-image/wald-01.jpg', 1200, 'webp')).toBe(
      '/api/image-picker/stock-image/wald-01.jpg?w=1200&fmt=webp'
    ));
  it('leaves a stock path with a query alone', () =>
    expect(sizedSrc('/api/image-picker/stock-image/wald-01.jpg?size=thumb', 400, 'webp')).toBe(
      '/api/image-picker/stock-image/wald-01.jpg?size=thumb'
    ));
  it('gives the portrait a srcset and high priority', () =>
    expect(siteImageAttrs('/api/share/abcdef123/preview', 'portrait')).toEqual({
      src: '/api/share/abcdef123/preview?w=800&fmt=webp',
      srcSet:
        '/api/share/abcdef123/preview?w=400&fmt=webp 400w, /api/share/abcdef123/preview?w=800&fmt=webp 800w, /api/share/abcdef123/preview?w=1200&fmt=webp 1200w',
      sizes: '(min-width: 64rem) 30rem, (min-width: 48rem) 42vw, 100vw',
      width: 800,
      height: 1000,
      loading: 'eager',
      fetchPriority: 'high',
    }));
  it('gives a stock image a srcset of allowed widths', () =>
    expect(siteImageAttrs('/api/image-picker/stock-image/wald-01.jpg', 'card')).toMatchObject({
      src: '/api/image-picker/stock-image/wald-01.jpg?w=800&fmt=webp',
      srcSet:
        '/api/image-picker/stock-image/wald-01.jpg?w=400&fmt=webp 400w, /api/image-picker/stock-image/wald-01.jpg?w=800&fmt=webp 800w',
    }));
  it('has no attributes for an empty image', () => expect(siteImageAttrs('', 'tile')).toBeNull());
});

describe('visibleBlocks', () => {
  const types = (blocks: { type: string }[]) => blocks.map((block) => block.type);
  const STANDARD = ['hero', 'about', 'heroImage', 'themes', 'actions', 'socialFeed', 'contact'];
  const empties = () =>
    withBlocks(minimalSnapshot(), [
      { id: 'hero', type: 'hero' },
      { id: 'ab', type: 'about', title: '', content: { type: 'doc' } },
      { id: 'bn', type: 'heroImage', imageUrl: '', title: '', subtitle: '' },
      { id: 'th', type: 'themes', items: [] },
      { id: 'ac', type: 'actions', items: [] },
      { id: 'co', type: 'contact', title: '', backgroundImageUrl: '' },
    ]);

  it('shows every filled block in list order', () =>
    expect(types(visibleBlocks(fullSnapshot(), 'public'))).toEqual(STANDARD));
  it('keeps a hidden block only on the editor canvas', () => {
    const s = withBlock(fullSnapshot(), 'themes', { hidden: true });
    expect(types(visibleBlocks(s, 'public'))).not.toContain('themes');
    expect(types(visibleBlocks(s, 'preview'))).not.toContain('themes');
    expect(types(visibleBlocks(s, 'preview', true))).toContain('themes');
  });
  it('drops empty blocks in public and keeps them in preview', () => {
    expect(types(visibleBlocks(empties(), 'public'))).toEqual(['hero']);
    expect(types(visibleBlocks(empties(), 'preview'))).toEqual(
      STANDARD.filter((t) => t !== 'socialFeed')
    );
  });
  it('shows an empty Instagram block as a placeholder in preview', () => {
    const empty = withBlock(fullSnapshot(), 'socialFeed', { instagramUsername: '' });
    expect(types(visibleBlocks(empty, 'preview'))).toContain('socialFeed');
    expect(types(visibleBlocks(empty, 'public'))).not.toContain('socialFeed');
  });
  it('numbers the anchors of repeated types', () => {
    const s = fullSnapshot();
    const anchors = blockAnchors([
      ...s.sections.blocks,
      { id: 'more', type: 'themes', items: [] },
      { id: 'evenmore', type: 'themes', items: [] },
    ]);
    expect(anchors.get('themes')).toBe('themen');
    expect(anchors.get('more')).toBe('themen-2');
    expect(anchors.get('evenmore')).toBe('themen-3');
  });
});

describe('copy, meta, grounds', () => {
  it('names the party by locale', () => {
    expect(siteCopy('de-DE').partyName).toBe('Bündnis 90/Die Grünen');
    expect(siteCopy('de-AT').partyName).toBe('Die Grünen – Die Grüne Alternative');
  });
  it('derives the description from the tagline', () => {
    expect(siteMeta(fullSnapshot({ tagline: 'Für Berlin' }), 'home').description).toBe(
      'Für Berlin'
    );
    const long = siteMeta(fullSnapshot({ tagline: 'wort '.repeat(40) }), 'home').description;
    expect(long.length).toBeLessThanOrEqual(158);
    expect(long.endsWith('…')).toBe(true);
    expect(siteMeta(minimalSnapshot('de-AT'), 'home').description).toBe(
      `${minimalSnapshot('de-AT').site_title} – Die Grünen – Die Grüne Alternative`
    );
  });
  it('titles the legal documents', () =>
    expect(siteMeta(fullSnapshot(), 'datenschutz').title).toBe(
      `Datenschutzerklärung – ${fullSnapshot().site_title}`
    ));
  it('maps the variant to grounds', () => {
    expect(sectionGround('dunkel', 'hero', 'de-DE')).toBe('surface');
    expect(sectionGround('hell', 'hero', 'de-DE')).toBe('surface');
    expect(sectionGround('leuchtend', 'themes', 'de-DE')).toBe('deep');
    expect(sectionGround('hell', 'footer', 'de-DE')).toBe('deep');
  });
  it('tints only the austrian light about section, every other combination is unchanged', () => {
    const parts = [
      'header',
      'hero',
      'about',
      'heroImage',
      'themes',
      'actions',
      'socialFeed',
      'contact',
      'footer',
    ] as const;
    const expected = {
      header: ['deep', 'surface', 'vivid'],
      hero: ['surface', 'surface', 'surface'],
      about: ['paper', 'paper', 'paper'],
      heroImage: ['photo', 'photo', 'photo'],
      themes: ['surface', 'paper', 'deep'],
      actions: ['paper', 'surface', 'paper'],
      socialFeed: ['surface', 'paper', 'surface'],
      contact: ['deep', 'surface', 'vivid'],
      footer: ['deeper', 'deep', 'deeper'],
    } as const;
    const variants = ['dunkel', 'hell', 'leuchtend'] as const;
    for (const locale of ['de-DE', 'de-AT'] as const)
      for (const part of parts)
        variants.forEach((variant, i) => {
          const tinted = locale === 'de-AT' && variant === 'hell' && part === 'about';
          expect(sectionGround(variant, part, locale)).toBe(tinted ? 'tint' : expected[part][i]);
        });
  });
  it('sets lang and data attributes on the root', () =>
    expect(siteRootAttributes(fullSnapshot({ locale: 'de-AT', variant: 'hell' }))).toEqual({
      lang: 'de-AT',
      'data-site-locale': 'de-AT',
      'data-site-variant': 'hell',
    }));
  it('builds the report link', () =>
    expect(reportHref('melden@example.org', 'https://grsites.de/anna')).toBe(
      'mailto:melden@example.org?subject=Meldung%20einer%20Website&body=https%3A%2F%2Fgrsites.de%2Fanna'
    ));
  it('builds site paths', () =>
    expect(sitePaths('anna')).toEqual({
      home: '/anna',
      impressum: '/anna/impressum',
      datenschutz: '/anna/datenschutz',
    }));
  it('builds the max fixture', () => {
    const s = maxSnapshot();
    expect(s.site_title).toHaveLength(120);
    expect(s.contact_email).toHaveLength(254);
  });
});

describe('focusClass', () => {
  it('names the step pair', () => expect(focusClass({ x: 25, y: 75 })).toBe('site-focus-25-75'));
  it.each([null, undefined, { x: 50 as const, y: 50 as const }])(
    'is empty for the centre or none (%j)',
    (focus) => expect(focusClass(focus)).toBe('')
  );
});
