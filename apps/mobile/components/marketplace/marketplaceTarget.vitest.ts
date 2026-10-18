import { type MarketplaceItem } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { marketplaceOpenTarget, marketplaceRoute } from './marketplaceTarget';

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
