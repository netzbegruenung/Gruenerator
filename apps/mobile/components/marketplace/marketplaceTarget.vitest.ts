import { type MarketplaceItem, type MarketplaceItemOf } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  marketplaceOpenTarget,
  marketplaceRoute,
  marketplaceShareUrl,
  templatePageUris,
} from './marketplaceTarget';

const template = (templateType: string | null, externalUrl: string | null) =>
  ({
    kind: 'template',
    ref: 'v1',
    title: 'Plakat',
    template: { templateType, externalUrl },
  }) as unknown as MarketplaceItem;

describe('marketplaceOpenTarget', () => {
  it('opens Agents and Rezepte on their native detail pages', () => {
    expect(
      marketplaceOpenTarget({ kind: 'agent', agent: { slug: 'u1' } } as unknown as MarketplaceItem)
    ).toEqual({
      type: 'route',
      href: { pathname: '/(focused)/grueneratoren/agent/[slug]', params: { slug: 'u1' } },
    });
    expect(
      marketplaceOpenTarget({
        kind: 'recipe',
        recipe: { mention: 'presse' },
      } as unknown as MarketplaceItem)
    ).toEqual({
      type: 'route',
      href: {
        pathname: '/(focused)/grueneratoren/rezept/[mention]',
        params: { mention: 'presse' },
      },
    });
  });

  it('opens a Notebook on its native page', () => {
    expect(
      marketplaceOpenTarget({
        kind: 'notebook',
        ref: 'nb-1',
        title: 'Klimaschutz',
        notebook: { slug: 'klimaschutz-Ab3xK9' },
      } as unknown as MarketplaceItem)
    ).toEqual({
      type: 'route',
      href: { pathname: '/notebook/[id]', params: { id: 'nb-1', title: 'Klimaschutz' } },
    });
  });

  it('opens a Grünerator-Vorlage in the web viewer and an external one at its URL', () => {
    expect(marketplaceOpenTarget(template('gruenerator', null))).toEqual({
      type: 'route',
      href: {
        pathname: '/(fullscreen)/web-viewer',
        params: { path: '/vorlagen/v/v1', title: 'Plakat' },
      },
    });
    expect(marketplaceOpenTarget(template('canva', 'https://canva.com/x'))).toEqual({
      type: 'url',
      url: 'https://canva.com/x',
    });
    expect(marketplaceOpenTarget(template('canva', null))).toEqual({ type: 'none' });
  });
});

describe('marketplaceRoute', () => {
  it('carries only the filters that differ from the defaults', () => {
    expect(marketplaceRoute()).toEqual({ pathname: '/(focused)/marktplatz', params: {} });
    expect(marketplaceRoute({ tab: 'sticker', q: 'sonne' })).toEqual({
      pathname: '/(focused)/marktplatz',
      params: { art: 'sticker', q: 'sonne' },
    });
  });
});

describe('marketplaceShareUrl', () => {
  it('points at the web Marktplatz with the item open', () => {
    expect(marketplaceShareUrl({ tab: 'vorlagen', item: { kind: 'template', ref: 'v1' } })).toBe(
      'https://gruenerator.eu/marktplatz?art=vorlagen&item=template%3Av1'
    );
  });

  it('keeps the filters the list was showing', () => {
    expect(
      marketplaceShareUrl({ origin: 'oeffentlich', q: 'wind', item: { kind: 'agent', ref: 'u1' } })
    ).toBe('https://gruenerator.eu/marktplatz?von=oeffentlich&q=wind&item=agent%3Au1');
  });
});

describe('templatePageUris', () => {
  const resolve = (url: string) => (url.startsWith('bad') ? null : `https://cdn/${url}`);
  const vorlage = (images: string[], thumbnailUrl: string | null) => ({
    thumbnailUrl,
    template: {
      images: images.map((url) => ({ url, title: null })),
    } as unknown as MarketplaceItemOf<'template'>['template'],
  });

  it('lists every page that resolves, in order', () => {
    expect(templatePageUris(vorlage(['1.png', 'bad.png', '2.png'], 't.png'), resolve)).toEqual([
      'https://cdn/1.png',
      'https://cdn/2.png',
    ]);
  });

  it('falls back to the thumbnail, then to nothing', () => {
    expect(templatePageUris(vorlage([], 't.png'), resolve)).toEqual(['https://cdn/t.png']);
    expect(templatePageUris(vorlage(['bad.png'], null), resolve)).toEqual([]);
  });
});
