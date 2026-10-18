import {
  MARKETPLACE_KINDS,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSort,
} from '@gruenerator/contracts';

import { landesverbandShelfLabel } from '../agents/landesverbandForRoles.js';

/**
 * Identity only, like `agenturaCategories.ts`: icons are drawn per platform
 * (react-icons on web, Ionicons on mobile), keyed by `MarketplaceTabIcon`, so
 * neither rendering library leaks into the other bundle.
 */
export type MarketplaceTabIcon = 'all' | 'agent' | 'recipe' | 'template' | 'sticker' | 'background';

interface MarketplaceTabDef {
  /** F0 — the `?art=` value in shared links. */
  slug: string;
  label: string;
  icon: MarketplaceTabIcon;
  kinds: readonly MarketplaceKind[];
  emptyText: string;
}

/** The Marktplatz tabs, in display order. */
export const MARKETPLACE_TABS = [
  {
    slug: 'alle',
    label: 'Alle',
    icon: 'all',
    kinds: MARKETPLACE_KINDS,
    emptyText: 'Im Marktplatz gibt es hier noch nichts.',
  },
  {
    slug: 'agents',
    label: 'Agents',
    icon: 'agent',
    kinds: ['agent'],
    emptyText: 'Hier gibt es noch keine Agents.',
  },
  {
    slug: 'rezepte',
    label: 'Rezepte',
    icon: 'recipe',
    kinds: ['recipe'],
    emptyText: 'Hier gibt es noch keine Rezepte.',
  },
  {
    slug: 'vorlagen',
    label: 'Vorlagen',
    icon: 'template',
    kinds: ['template'],
    emptyText: 'Hier gibt es noch keine Vorlagen.',
  },
  {
    slug: 'sticker',
    label: 'Sticker',
    icon: 'sticker',
    kinds: ['sticker'],
    emptyText: 'Hier gibt es noch keine Sticker.',
  },
  {
    slug: 'hintergruende',
    label: 'Hintergründe',
    icon: 'background',
    kinds: ['background'],
    emptyText: 'Hier gibt es noch keine Hintergründe.',
  },
] as const satisfies readonly MarketplaceTabDef[];

export type MarketplaceTab = (typeof MARKETPLACE_TABS)[number];
export type MarketplaceTabSlug = MarketplaceTab['slug'];

export const DEFAULT_MARKETPLACE_TAB: MarketplaceTabSlug = 'alle';

export const MARKETPLACE_TAB_SLUGS: readonly MarketplaceTabSlug[] = MARKETPLACE_TABS.map(
  (t) => t.slug
);

export function getMarketplaceTab(slug: MarketplaceTabSlug): MarketplaceTab {
  // Every slug of the union has its entry; `find` cannot prove it.
  return MARKETPLACE_TABS.find((t) => t.slug === slug) as MarketplaceTab;
}

/** The single-kind tab of a kind — its label is also the section heading under „Alle". */
export function tabForKind(kind: MarketplaceKind): MarketplaceTab {
  return MARKETPLACE_TABS.find(
    (t) => t.kinds.length === 1 && t.kinds[0] === kind
  ) as MarketplaceTab;
}

/** What an empty list says; a search gets its own sentence. */
export function marketplaceEmptyText(tab: MarketplaceTabSlug, q: string): string {
  const query = q.trim();
  return query ? `Keine Treffer für „${query}“.` : getMarketplaceTab(tab).emptyText;
}

/** F0 values (= the Agentura's `?von=`), in display order. */
export const MARKETPLACE_ORIGINS = [
  { value: 'offiziell', label: 'Offiziell' },
  // Fallback only — rendered through `marketplaceOriginLabel` with the person's Landesverbände.
  { value: 'landesverband', label: landesverbandShelfLabel(null) },
  { value: 'oeffentlich', label: 'Öffentlich' },
] as const satisfies readonly { value: MarketplaceOrigin; label: string }[];

/** The filter label of an origin; the Landesverband one names the person's own (`Grüne Hessen`). */
export function marketplaceOriginLabel(
  origin: MarketplaceOrigin,
  lvIds: readonly string[] | null
): string {
  if (origin === 'landesverband') return landesverbandShelfLabel(lvIds);
  return MARKETPLACE_ORIGINS.find((o) => o.value === origin)?.label ?? origin;
}

/** The badge on a card; public content carries its author instead. */
export const MARKETPLACE_ORIGIN_BADGE: Record<MarketplaceOrigin, string | null> = {
  offiziell: 'Offiziell',
  landesverband: 'Landesverband',
  oeffentlich: null,
};

export const MARKETPLACE_SORTS = [
  { value: 'empfohlen', label: 'Empfohlen' },
  { value: 'neu', label: 'Neu' },
  { value: 'beliebt', label: 'Beliebt' },
] as const satisfies readonly { value: MarketplaceSort; label: string }[];

export const DEFAULT_MARKETPLACE_SORT: MarketplaceSort = 'empfohlen';
