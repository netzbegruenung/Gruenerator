import { type MarketplaceKind, type MarketplaceOrigin } from '@gruenerator/contracts';

import {
  MARKETPLACE_ORIGINS,
  MARKETPLACE_TABS,
  type MarketplaceTab,
  type MarketplaceTabSlug,
} from './registry.js';

/** Origins tell Agents, Rezepte, Sticker and Hintergründe apart; Vorlagen are always public. */
const ORIGIN_KINDS: readonly MarketplaceKind[] = ['agent', 'recipe', 'sticker', 'background'];

/**
 * The tabs a view offers: „Alle" (= every allowed kind) when there is more than
 * one kind, then each single-kind tab whose kind is allowed.
 */
export function marketplaceTabsFor(kinds: readonly MarketplaceKind[]): MarketplaceTab[] {
  const single = MARKETPLACE_TABS.filter(
    (t) => t.slug !== 'alle' && t.kinds.every((k) => kinds.includes(k))
  );
  return single.length > 1 ? [MARKETPLACE_TABS[0], ...single] : single;
}

/** The tab actually shown — a link to a tab the view does not offer falls back to the first. */
export function shownMarketplaceTab(
  tab: MarketplaceTabSlug,
  kinds: readonly MarketplaceKind[]
): MarketplaceTabSlug {
  const tabs = marketplaceTabsFor(kinds);
  return tabs.some((t) => t.slug === tab) ? tab : (tabs[0]?.slug ?? 'alle');
}

/** The kinds a tab shows within what the view allows. */
export function kindsOfMarketplaceTab(
  tab: MarketplaceTabSlug,
  kinds: readonly MarketplaceKind[]
): readonly MarketplaceKind[] {
  if (tab === 'alle') return kinds;
  return MARKETPLACE_TABS.find((t) => t.slug === tab)?.kinds ?? kinds;
}

/** Whether the origin filter means anything for these kinds. */
export const showsMarketplaceOrigins = (kinds: readonly MarketplaceKind[]): boolean =>
  kinds.some((k) => ORIGIN_KINDS.includes(k));

/**
 * The origins to offer: the Landesverband aisle only for people with a
 * Landesverband — the assignment is the access — or when a link already chose it.
 */
export function marketplaceOriginsFor(
  lvIds: readonly string[] | null,
  current: MarketplaceOrigin | null
): (typeof MARKETPLACE_ORIGINS)[number][] {
  return MARKETPLACE_ORIGINS.filter(
    (o) => o.value !== 'landesverband' || (lvIds?.length ?? 0) > 0 || current === 'landesverband'
  );
}
