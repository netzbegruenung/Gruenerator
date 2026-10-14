import { describe, expect, it } from 'vitest';

import { SHOP_ORIGINS, legacyAgenturaRedirect, parseMarketParams } from './useMarketFilters';

const parse = (query: string) => parseMarketParams(new URLSearchParams(query), SHOP_ORIGINS);
const redirect = (query: string) => legacyAgenturaRedirect(new URLSearchParams(query));

describe('parseMarketParams', () => {
  it('defaults to everything, recommended order', () => {
    expect(parse('')).toEqual({ search: '', type: 'all', sort: 'empfohlen', origin: null });
  });

  it('reads the explicit params', () => {
    expect(parse('q=pressemitteilung&type=recipe&sort=az&von=landesverband')).toEqual({
      search: 'pressemitteilung',
      type: 'recipe',
      sort: 'az',
      origin: 'landesverband',
    });
  });

  it('ignores an origin the page does not know', () => {
    expect(parse('von=meine').origin).toBeNull();
    expect(parseMarketParams(new URLSearchParams('von=offiziell'), []).origin).toBeNull();
  });

  it('ignores unknown values', () => {
    expect(parse('type=nope&sort=nope')).toMatchObject({ type: 'all', sort: 'empfohlen' });
  });
});

describe('legacyAgenturaRedirect', () => {
  it('leaves shop links alone', () => {
    expect(redirect('')).toBeNull();
    expect(redirect('q=presse&type=recipe')).toBeNull();
    expect(redirect('von=offiziell')).toBeNull();
  });

  it('sends the old personal shelves to the overview, keeping the rest', () => {
    expect(redirect('cat=meine')).toBe('/grueneratoren');
    expect(redirect('cat=favoriten')).toBe('/grueneratoren?type=fav');
    expect(redirect('cat=meine&q=presse&sort=az')).toBe('/grueneratoren?q=presse&sort=az');
    expect(redirect('type=task')).toBe('/grueneratoren?type=task');
  });

  it('turns the old shop shelves into an origin', () => {
    expect(redirect('cat=community')).toBe('/agentura?von=oeffentlich');
    expect(redirect('cat=gruenerator')).toBe('/agentura?von=offiziell');
    expect(redirect('cat=landesverband&type=agent')).toBe('/agentura?type=agent&von=landesverband');
  });

  it('drops a retired shelf without guessing', () => {
    expect(redirect('cat=gruppen')).toBe('/agentura');
  });
});
