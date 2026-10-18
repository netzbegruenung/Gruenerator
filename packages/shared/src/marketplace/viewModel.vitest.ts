import { type MarketplaceItem, type StudioAssetItem } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { canReport, itemHref, toCardModel, toGalleryAsset } from './viewModel';

const base = {
  origin: 'oeffentlich' as const,
  description: 'Beschreibung',
  thumbnailUrl: null,
  iconKey: null,
  authorName: 'Alex',
  audience: 'all' as const,
  likesCount: 3,
  liked: false,
  saved: false,
  isOwn: false,
  createdAt: null,
};

const asset: StudioAssetItem = {
  id: 'a1',
  kind: 'sticker',
  title: 'Sonne',
  tags: [],
  src: '/share/a1.png',
  thumbUrl: '/share/a1-thumb.png',
  width: 400,
  height: 300,
  source: 'upload',
  visibility: 'public',
  audience: 'all',
  moderation: 'ok',
  isOwn: false,
  authorName: 'Alex',
  likesCount: 3,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const agent: MarketplaceItem = {
  ...base,
  kind: 'agent',
  key: 'agent:presse',
  ref: 'presse',
  origin: 'offiziell',
  title: 'Presse',
  iconKey: 'newspaper',
  authorName: null,
  reportKind: null,
  agent: { identifier: 'presse', slug: 'presse-agent', isUserAgent: false },
};

const recipe: MarketplaceItem = {
  ...base,
  kind: 'recipe',
  key: 'recipe:row-1',
  ref: 'row-1',
  title: 'Pressemitteilung',
  reportKind: 'user_text_form',
  recipe: { mention: 'pm/kurz', rowId: 'row-1', skillCategory: null, system: false },
};

const template = (templateType: string | null, externalUrl: string | null): MarketplaceItem => ({
  ...base,
  kind: 'template',
  key: 'template:t1',
  ref: 't1',
  title: 'Plakat',
  reportKind: 'user_template',
  template: {
    templateType,
    externalUrl,
    images: [],
    categories: [],
    tags: [],
    contentData: {},
    metadata: {},
  },
});

const sticker: MarketplaceItem = {
  ...base,
  kind: 'sticker',
  key: 'sticker:a1',
  ref: 'a1',
  title: 'Sonne',
  reportKind: 'studio_asset',
  asset,
};

describe('toCardModel', () => {
  it('badges official content and leaves the author out', () => {
    expect(toCardModel(agent)).toMatchObject({
      key: 'agent:presse',
      title: 'Presse',
      subtitle: null,
      badge: 'Offiziell',
      iconKey: 'newspaper',
    });
  });

  it('shows the author of public content without a badge', () => {
    expect(toCardModel(recipe)).toMatchObject({ subtitle: 'Alex', badge: null, likesCount: 3 });
  });

  it('falls back to the asset image when the item has no thumbnail', () => {
    expect(toCardModel(sticker).thumbnailUrl).toBe('/share/a1-thumb.png');
    expect(toCardModel({ ...sticker, thumbnailUrl: '/x.png' }).thumbnailUrl).toBe('/x.png');
  });
});

describe('toGalleryAsset', () => {
  it('keeps exactly what the Profilbild pickers take', () => {
    expect(toGalleryAsset(sticker as Extract<MarketplaceItem, { kind: 'sticker' }>)).toEqual({
      id: 'a1',
      kind: 'sticker',
      src: '/share/a1.png',
      title: 'Sonne',
      width: 400,
      height: 300,
    });
  });
});

describe('itemHref', () => {
  it('leads Agents and Rezepte to their Agentura pages', () => {
    expect(itemHref(agent)).toBe('/agentura/agent/presse-agent');
    expect(itemHref(recipe)).toBe('/agentura/rezept/pm%2Fkurz');
  });

  it('opens a Grünerator-Vorlage in the app and an external one at its URL', () => {
    expect(itemHref(template('gruenerator', null))).toBe('/vorlagen/v/t1');
    expect(itemHref(template('canva', 'https://canva.com/x'))).toBe('https://canva.com/x');
    expect(itemHref(template('canva', null))).toBeNull();
  });

  it('has no page for Sticker', () => {
    expect(itemHref(sticker)).toBeNull();
  });
});

describe('canReport', () => {
  it('allows reporting other people’s public content only', () => {
    expect(canReport(recipe)).toBe(true);
    expect(canReport({ ...recipe, isOwn: true })).toBe(false);
    expect(canReport(agent)).toBe(false);
  });
});
