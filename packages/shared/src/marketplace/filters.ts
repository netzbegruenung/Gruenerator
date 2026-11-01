import {
  marketplaceCollectionIdSchema,
  marketplaceKindSchema,
  marketplaceOriginSchema,
  marketplaceSortSchema,
  type MarketplaceCollectionId,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSort,
} from '@gruenerator/contracts';

import { type MarketplaceTarget } from './cache.js';
import { categoryById, type MarketplaceCategoryId } from './categories.js';
import {
  DEFAULT_MARKETPLACE_SORT,
  DEFAULT_MARKETPLACE_TAB,
  MARKETPLACE_TAB_SLUGS,
  getMarketplaceTab,
  type MarketplaceTabSlug,
} from './registry.js';

export const MARKETPLACE_PATH = '/marktplatz';
export const GRUENERATOREN_PATH = '/grueneratoren';
export const AGENTURA_PATH = '/agentura';

/** What the Marktplatz shows — all of it in the address, so a shared link shows the same view. */
export interface MarketplaceFilters {
  tab: MarketplaceTabSlug;
  /** `null` = every origin. */
  origin: MarketplaceOrigin | null;
  q: string;
  sort: MarketplaceSort;
  /** The item opened in its detail (`item=<kind>:<ref>`), so a link can share it; `null` = the list. */
  item: MarketplaceTarget | null;
  /** The front page collection opened (`kollektion=<id>`); `null` = none. */
  collection: MarketplaceCollectionId | null;
  /** The category page opened (`kategorie=<id>`); `null` = none. */
  category: MarketplaceCategoryId | null;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
  tab: DEFAULT_MARKETPLACE_TAB,
  origin: null,
  q: '',
  sort: DEFAULT_MARKETPLACE_SORT,
  item: null,
  collection: null,
  category: null,
};

/** Same bound as the API's `ref` path parameter. */
const ITEM_REF_MAX = 200;

/** `<kind>:<ref>` — split at the first colon, since a ref may hold more. */
function parseItemParam(raw: string | null): MarketplaceTarget | null {
  if (!raw) return null;
  const colon = raw.indexOf(':');
  if (colon === -1) return null;
  const kind = marketplaceKindSchema.safeParse(raw.slice(0, colon));
  const ref = raw.slice(colon + 1);
  if (!kind.success || !ref || ref.length > ITEM_REF_MAX) return null;
  return { kind: kind.data, ref };
}

/** Web's `URLSearchParams` or expo-router's `useLocalSearchParams()`. */
export type MarketplaceParamSource =
  URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>>;

function readParam(source: MarketplaceParamSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const raw = key in source ? source[key] : null;
  if (typeof raw === 'string') return raw;
  return raw?.[0] ?? null;
}

function toSearchParams(source: MarketplaceParamSource): URLSearchParams {
  if (source instanceof URLSearchParams) return new URLSearchParams(source);
  const params = new URLSearchParams();
  for (const key of Object.keys(source)) {
    const value = readParam(source, key);
    if (value !== null) params.set(key, value);
  }
  return params;
}

const isTabSlug = (value: string | null): value is MarketplaceTabSlug =>
  value !== null && (MARKETPLACE_TAB_SLUGS as readonly string[]).includes(value);

/** Unknown values fall back to the default instead of failing. */
export function parseMarketplaceParams(source: MarketplaceParamSource): MarketplaceFilters {
  const art = readParam(source, 'art');
  const origin = marketplaceOriginSchema.safeParse(readParam(source, 'von'));
  const sort = marketplaceSortSchema.safeParse(readParam(source, 'sort'));
  const collection = marketplaceCollectionIdSchema.safeParse(readParam(source, 'kollektion'));
  return {
    tab: isTabSlug(art) ? art : DEFAULT_MARKETPLACE_FILTERS.tab,
    origin: origin.success ? origin.data : null,
    q: readParam(source, 'q') ?? '',
    sort: sort.success ? sort.data : DEFAULT_MARKETPLACE_FILTERS.sort,
    item: parseItemParam(readParam(source, 'item')),
    collection: collection.success ? collection.data : null,
    category: categoryById(readParam(source, 'kategorie'))?.id ?? null,
  };
}

/** `art`, `von`, `q`, `sort`, `item`, `kollektion`, `kategorie` — defaults left out, so the plain page stays `/marktplatz`. */
export function serializeMarketplaceParams(filters: MarketplaceFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tab !== DEFAULT_MARKETPLACE_FILTERS.tab) params.set('art', filters.tab);
  if (filters.origin !== null) params.set('von', filters.origin);
  if (filters.q.trim()) params.set('q', filters.q);
  if (filters.sort !== DEFAULT_MARKETPLACE_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.item) params.set('item', `${filters.item.kind}:${filters.item.ref}`);
  if (filters.collection) params.set('kollektion', filters.collection);
  if (filters.category) params.set('kategorie', filters.category);
  return params;
}

export function marketplaceHref(filters: Partial<MarketplaceFilters> = {}): string {
  const query = serializeMarketplaceParams({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...filters,
  }).toString();
  return query ? `${MARKETPLACE_PATH}?${query}` : MARKETPLACE_PATH;
}

/**
 * Die Seite eines Landesverbands im Marktplatz. `slug` ist der Hub-Slug
 * (`LvHub.slug`, z. B. `gruene-berlin`) — derselbe wie in `/agents/<slug>`.
 */
export function landesverbandHubHref(slug: string): string {
  return `${MARKETPLACE_PATH}/landesverband/${encodeURIComponent(slug)}`;
}

export function kindsForTab(tab: MarketplaceTabSlug): readonly MarketplaceKind[] {
  return getMarketplaceTab(tab).kinds;
}

/** Die alten Regale (`?cat=`) und wohin sie heute gehören. */
const LEGACY_SHELVES: Record<string, MarketplaceOrigin | 'uebersicht'> = {
  meine: 'uebersicht',
  favoriten: 'uebersicht',
  landesverband: 'landesverband',
  gruenerator: 'offiziell',
  community: 'oeffentlich',
};

/**
 * Bis Oktober 2026 war `/agentura` die Übersicht über alles, und Links aus
 * Chat-Antworten, Einstellungen und Lesezeichen tragen das weiter. Ein Link,
 * der die Übersicht meinte, führt deshalb auf `/grueneratoren`; ein Regal, das
 * heute ein Gang im Shop ist, wird zu `?von=`. `null` = der Link meint den Shop.
 */
export function legacyAgenturaRedirect(params: URLSearchParams): string | null {
  const cat = params.get('cat');
  const target = cat ? (LEGACY_SHELVES[cat] ?? null) : null;
  // Wiederkehrende Aufgaben gibt es nur auf der Übersicht.
  const toOverview = target === 'uebersicht' || params.get('type') === 'task';
  if (!cat && !toOverview) return null;

  const next = new URLSearchParams(params);
  next.delete('cat');
  if (toOverview) {
    next.delete('von');
    // Das alte Favoriten-Regal ist heute der Favoriten-Filter der Übersicht.
    if (cat === 'favoriten') next.set('type', 'fav');
    const query = next.toString();
    return query ? `${GRUENERATOREN_PATH}?${query}` : GRUENERATOREN_PATH;
  }
  if (target) next.set('von', target);
  const query = next.toString();
  return query ? `${AGENTURA_PATH}?${query}` : AGENTURA_PATH;
}

const AGENTURA_TYPE_TABS: Partial<Record<string, MarketplaceTabSlug>> = {
  agent: 'agents',
  recipe: 'rezepte',
};

/**
 * Where an old `/agentura?…` link lands. The overview shelves still go to
 * `/grueneratoren` (`legacyAgenturaRedirect`); everything else becomes the
 * Marktplatz with `type` → tab, `von` and `q` carried over. The Agentura's
 * `sort=az` has no counterpart and is dropped.
 */
export function agenturaToMarketplaceHref(source: MarketplaceParamSource): string {
  const legacy = legacyAgenturaRedirect(toSearchParams(source));
  if (legacy?.startsWith(GRUENERATOREN_PATH)) return legacy;
  const shop = legacy ? new URLSearchParams(legacy.split('?')[1] ?? '') : toSearchParams(source);

  const origin = marketplaceOriginSchema.safeParse(shop.get('von'));
  return marketplaceHref({
    tab: AGENTURA_TYPE_TABS[shop.get('type') ?? ''] ?? DEFAULT_MARKETPLACE_TAB,
    origin: origin.success ? origin.data : null,
    q: shop.get('q') ?? '',
  });
}

/** `/studio/sticker/entdecken?q=` (and an optional `kind`) → the Sticker or Hintergründe tab. */
export function stickerDiscoverToMarketplaceHref(source: MarketplaceParamSource): string {
  return marketplaceHref({
    tab: readParam(source, 'kind') === 'background' ? 'hintergruende' : 'sticker',
    q: readParam(source, 'q') ?? '',
  });
}
