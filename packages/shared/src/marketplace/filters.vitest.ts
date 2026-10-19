import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MARKETPLACE_FILTERS,
  agenturaToMarketplaceHref,
  kindsForTab,
  legacyAgenturaRedirect,
  marketplaceHref,
  parseMarketplaceParams,
  serializeMarketplaceParams,
  stickerDiscoverToMarketplaceHref,
  type MarketplaceFilters,
} from './filters';

const parse = (query: string) => parseMarketplaceParams(new URLSearchParams(query));

describe('parseMarketplaceParams / serializeMarketplaceParams', () => {
  it('round-trips every non-default filter', () => {
    const filters: MarketplaceFilters = {
      tab: 'hintergruende',
      origin: 'landesverband',
      q: 'Klima & Wald',
      sort: 'beliebt',
      item: { kind: 'recipe', ref: 'presse' },
    };
    const query = serializeMarketplaceParams(filters).toString();
    expect(query).toBe(
      'art=hintergruende&von=landesverband&q=Klima+%26+Wald&sort=beliebt&item=recipe%3Apresse'
    );
    expect(parse(query)).toEqual(filters);
  });

  it('leaves the defaults out of the address', () => {
    expect(serializeMarketplaceParams(DEFAULT_MARKETPLACE_FILTERS).toString()).toBe('');
    expect(marketplaceHref()).toBe('/marktplatz');
    expect(marketplaceHref({ q: '   ' })).toBe('/marktplatz');
    expect(marketplaceHref({ tab: 'rezepte' })).toBe('/marktplatz?art=rezepte');
  });

  it('falls back to the defaults for unknown values', () => {
    expect(parse('art=shop&von=gruppe&sort=az')).toEqual(DEFAULT_MARKETPLACE_FILTERS);
  });

  it('reads the opened item as <kind>:<ref>, splitting at the first colon', () => {
    expect(parse('item=template%3A0b6f3c1e-8a4d').item).toEqual({
      kind: 'template',
      ref: '0b6f3c1e-8a4d',
    });
    expect(parse('item=agent:a:b').item).toEqual({ kind: 'agent', ref: 'a:b' });
    expect(marketplaceHref({ item: { kind: 'sticker', ref: 's1' } })).toBe(
      '/marktplatz?item=sticker%3As1'
    );
  });

  it('ignores an item param it cannot read', () => {
    for (const raw of ['', 'agent', 'agent:', 'buch:1', `agent:${'x'.repeat(201)}`]) {
      expect(parse(`item=${raw}`).item).toBeNull();
    }
  });

  it('reads expo-router params, including array values', () => {
    expect(parseMarketplaceParams({ art: ['vorlagen', 'agents'], q: 'Plakat' })).toEqual({
      ...DEFAULT_MARKETPLACE_FILTERS,
      tab: 'vorlagen',
      q: 'Plakat',
    });
  });
});

describe('kindsForTab', () => {
  it('maps a tab to the kinds it asks the server for', () => {
    expect(kindsForTab('alle')).toEqual([
      'agent',
      'recipe',
      'template',
      'sticker',
      'background',
      'notebook',
    ]);
    expect(kindsForTab('notebooks')).toEqual(['notebook']);
    expect(kindsForTab('hintergruende')).toEqual(['background']);
    expect(kindsForTab('rezepte')).toEqual(['recipe']);
  });
});

describe('legacyAgenturaRedirect (moved from web)', () => {
  const redirect = (query: string) => legacyAgenturaRedirect(new URLSearchParams(query));

  it('leaves shop links alone', () => {
    expect(redirect('')).toBeNull();
    expect(redirect('q=presse&type=recipe')).toBeNull();
  });

  it('sends the personal shelves to the overview and shop shelves to an origin', () => {
    expect(redirect('cat=favoriten')).toBe('/grueneratoren?type=fav');
    expect(redirect('cat=community')).toBe('/agentura?von=oeffentlich');
  });
});

describe('agenturaToMarketplaceHref', () => {
  const href = (query: string) => agenturaToMarketplaceHref(new URLSearchParams(query));

  it('turns the shop into the Marktplatz', () => {
    expect(href('')).toBe('/marktplatz');
    expect(href('type=agent&von=offiziell&q=presse')).toBe(
      '/marktplatz?art=agents&von=offiziell&q=presse'
    );
    expect(href('type=recipe&sort=az')).toBe('/marktplatz?art=rezepte');
    expect(href('type=all&von=nirgends')).toBe('/marktplatz');
  });

  it('maps the old shelves through the legacy redirect first', () => {
    expect(href('cat=community&type=agent')).toBe('/marktplatz?art=agents&von=oeffentlich');
    expect(href('cat=landesverband')).toBe('/marktplatz?von=landesverband');
  });

  it('keeps the overview links on /grueneratoren', () => {
    expect(href('cat=meine&q=presse&sort=az')).toBe('/grueneratoren?q=presse&sort=az');
    expect(href('cat=favoriten')).toBe('/grueneratoren?type=fav');
    expect(href('type=task')).toBe('/grueneratoren?type=task');
  });

  it('reads expo-router params', () => {
    expect(agenturaToMarketplaceHref({ type: 'recipe', von: 'landesverband' })).toBe(
      '/marktplatz?art=rezepte&von=landesverband'
    );
  });
});

describe('stickerDiscoverToMarketplaceHref', () => {
  it('opens the Sticker tab with the search', () => {
    expect(stickerDiscoverToMarketplaceHref(new URLSearchParams('q=Sonne'))).toBe(
      '/marktplatz?art=sticker&q=Sonne'
    );
    expect(stickerDiscoverToMarketplaceHref(new URLSearchParams(''))).toBe(
      '/marktplatz?art=sticker'
    );
  });

  it('opens the Hintergründe tab for kind=background', () => {
    expect(stickerDiscoverToMarketplaceHref({ kind: 'background', q: 'Wald' })).toBe(
      '/marktplatz?art=hintergruende&q=Wald'
    );
  });
});
