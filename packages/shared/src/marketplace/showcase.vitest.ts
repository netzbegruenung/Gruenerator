import { type MarketplaceItem } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getLandesverbandHubById } from '../agents/landesverbandHubs';

import {
  kindsOfMarketplaceTab,
  marketplaceOriginsFor,
  marketplaceTabsFor,
  shownMarketplaceTab,
} from './browse';
import {
  collectionAddState,
  collectionCardsFor,
  collectionCoverPath,
  emphasisParts,
  landesverbandHubsOwnFirst,
  singleLandesverbandHub,
  sortByHubOrder,
} from './showcase';

const item = (kind: MarketplaceItem['kind'], ref: string, saved = false) =>
  ({ key: `${kind}:${ref}`, kind, ref, saved }) as MarketplaceItem;

describe('tabs and origins', () => {
  it('offers „Alle" only with more than one kind, and falls back to the first tab', () => {
    expect(marketplaceTabsFor(['sticker', 'background']).map((t) => t.slug)).toEqual([
      'alle',
      'sticker',
      'hintergruende',
    ]);
    expect(marketplaceTabsFor(['template']).map((t) => t.slug)).toEqual(['vorlagen']);
    expect(shownMarketplaceTab('agents', ['template'])).toBe('vorlagen');
    expect(kindsOfMarketplaceTab('alle', ['sticker', 'background'])).toEqual([
      'sticker',
      'background',
    ]);
  });

  it('keeps the Landesverband origin for people with one, or when a link chose it', () => {
    const values = (lvIds: string[] | null, current: 'landesverband' | null) =>
      marketplaceOriginsFor(lvIds, current).map((o) => o.value);
    expect(values([], null)).toEqual(['offiziell', 'oeffentlich']);
    expect(values(['hessen'], null)).toContain('landesverband');
    expect(values(null, 'landesverband')).toContain('landesverband');
  });
});

describe('collections', () => {
  it('leaves unlisted collections out and splits the themes row off', () => {
    const answer = [
      { collectionId: 'starter' as const, items: [] },
      { collectionId: 'queer' as const, items: [] },
      { collectionId: 'wahlkampf-moritz' as const, items: [] },
    ];
    expect(collectionCardsFor(answer, 'rest').map((c) => c.def.id)).toEqual(['starter']);
    expect(collectionCardsFor(answer, 'themen').map((c) => c.def.id)).toEqual(['queer']);
    expect(collectionCardsFor(answer).map((c) => c.def.id)).toEqual(['starter', 'queer']);
  });

  it('counts only Agents and Rezepte for „Alle hinzufügen"', () => {
    expect(
      collectionAddState([item('agent', 'a'), item('recipe', 'b'), item('sticker', 's')]).label
    ).toBe('Alle 2 hinzufügen');
    expect(collectionAddState([item('agent', 'a', true), item('recipe', 'b')]).label).toBe(
      '1 weitere hinzufügen'
    );
    expect(collectionAddState([item('agent', 'a', true)]).label).toBeNull();
  });

  it('splits a description at its bold marks', () => {
    expect(emphasisParts('Das **Wahlrecht** erkämpft')).toEqual([
      { text: 'Das ', strong: false },
      { text: 'Wahlrecht', strong: true },
      { text: ' erkämpft', strong: false },
    ]);
  });

  it('builds origin-relative cover paths', () => {
    const cover = { file: 'queer-v2', alt: '', credit: null };
    expect(collectionCoverPath(cover, 640)).toBe(
      '/images/marketplace/collections/queer-v2-640.webp'
    );
    expect(collectionCoverPath(cover, 1200, true)).toBe(
      '/images/marketplace/collections/queer-v2-banner-1200.webp'
    );
  });
});

describe('Landesverbände', () => {
  it('puts the own Landesverband first and names it only when there is exactly one', () => {
    const hubs = landesverbandHubsOwnFirst('de-DE', ['hessen']);
    expect(hubs[0]).toMatchObject({ own: true, hub: { lvId: 'hessen' } });
    expect(hubs.slice(1).every((h) => !h.own)).toBe(true);
    expect(singleLandesverbandHub(['hessen'])?.lvId).toBe('hessen');
    expect(singleLandesverbandHub(['hessen', 'bayern'])).toBeNull();
    expect(landesverbandHubsOwnFirst('de-AT', []).every((h) => h.hub.audience === 'de-AT')).toBe(
      true
    );
  });

  it('sorts a hub’s Agents in hub order, unknown ones last', () => {
    const hub = getLandesverbandHubById('hessen')!;
    const [first, second] = hub.agentIds;
    const sorted = sortByHubOrder(hub, [
      item('agent', 'other'),
      item('agent', second!),
      item('agent', first!),
    ]);
    expect(sorted.map((i) => i.ref)).toEqual([first, second, 'other']);
  });
});
