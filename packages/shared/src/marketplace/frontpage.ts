import {
  marketplaceFrontpageShelfIdSchema,
  type MarketplaceFrontpageResponse,
  type MarketplaceFrontpageShelf,
  type MarketplaceFrontpageShelfId,
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSection,
  type MarketplaceSort,
} from '@gruenerator/contracts';

import { type MarketplaceTarget } from './cache.js';
import { type MarketplaceFilters } from './filters.js';
import { DEFAULT_MARKETPLACE_SORT } from './registry.js';

/**
 * The Marktplatz front page — what „Start" shows instead of one aisle per kind.
 * Small on purpose: every shelf hides itself below its minimum, so a thin
 * catalogue reads as a short page rather than a page of half-empty rows.
 * The server composes the page (`GET /api/marketplace/frontpage`) from the
 * rules below; clients only render it. A new shelf is a new entry here plus
 * its rendering — each one is a `sections` list with its own kinds, origin
 * and sort.
 */

/** The front page replaces the list only while nothing narrows it; a search gets the result list. */
export function isFrontpageView(filters: MarketplaceFilters): boolean {
  return (
    filters.tab === 'alle' &&
    filters.item === null &&
    filters.q.trim() === '' &&
    filters.origin === null &&
    filters.sort === DEFAULT_MARKETPLACE_SORT
  );
}

export interface MarketplaceFeature extends MarketplaceTarget {
  /** F1 — stable id of the slot. */
  id: string;
  audience: 'de-DE' | 'de-AT' | 'all';
  kicker: string;
  /** The pitch in the slot; the item's own description is shorter and written for the card. */
  pitch: string;
  /** A short exchange that shows what the item does; `null` = the slot shows its icon instead. */
  example: { prompt: string; answer: string } | null;
}

/**
 * „Im Fokus" — curated by PR. The first entry for the viewer's audience that
 * the server still returns wins; none → the newest official agent or recipe.
 */
export const MARKETPLACE_FEATURES = [
  {
    id: 'leichte-sprache',
    kind: 'agent',
    ref: 'gruenerator-leichte-sprache',
    audience: 'all',
    kicker: 'Im Fokus',
    pitch:
      'Übersetzt Beschlüsse, Pressetexte und Einladungen in Leichte Sprache — mit kurzen Sätzen, erklärten Wörtern und klarer Gliederung.',
    example: {
      prompt: 'Schreib unseren Beschluss zum Radweg an der Hauptstraße in Leichter Sprache.',
      answer:
        'Der Gemeinde-Rat hat etwas beschlossen.\nAn der Haupt-Straße kommt ein Rad-Weg.\nDann ist Rad-Fahren dort sicherer.',
    },
  },
] as const satisfies readonly MarketplaceFeature[];

export function featureFor(locale: string | null): MarketplaceFeature | null {
  const audience = locale === 'de-AT' ? 'de-AT' : 'de-DE';
  return MARKETPLACE_FEATURES.find((f) => f.audience === 'all' || f.audience === audience) ?? null;
}

/** The slot behind a front page answer's `featureId`; `null` for the fallback item. */
export function featureById(id: string | null): MarketplaceFeature | null {
  return MARKETPLACE_FEATURES.find((f) => f.id === id) ?? null;
}

/** Agents and Rezepte — the kinds with an origin and a text card. */
export const FRONTPAGE_TEXT_KINDS = [
  'agent',
  'recipe',
] as const satisfies readonly MarketplaceKind[];
/** Vorlagen, Sticker, Hintergründe — the kinds with an image. */
export const FRONTPAGE_VISUAL_KINDS = [
  'template',
  'sticker',
  'background',
] as const satisfies readonly MarketplaceKind[];

/** How many items each shelf shows, and below how many it hides. */
export const FRONTPAGE_SHELVES = {
  landesverband: { show: 3, min: 2 },
  neu: { show: 4, min: 1 },
  beliebt: { show: 5, min: 5 },
  gestalten: { show: 8, min: 3 },
} as const;

interface ShelfQuery {
  kinds: readonly MarketplaceKind[];
  sort: MarketplaceSort;
  origin: MarketplaceOrigin | null;
}

/** What each shelf asks the list for; `sectionLimit` is the shelf's `show`. */
export const FRONTPAGE_SHELF_QUERIES = {
  landesverband: { kinds: FRONTPAGE_TEXT_KINDS, sort: 'empfohlen', origin: 'landesverband' },
  neu: { kinds: FRONTPAGE_TEXT_KINDS, sort: 'neu', origin: null },
  beliebt: { kinds: FRONTPAGE_TEXT_KINDS, sort: 'beliebt', origin: null },
  gestalten: { kinds: FRONTPAGE_VISUAL_KINDS, sort: 'empfohlen', origin: null },
} as const satisfies Record<MarketplaceFrontpageShelfId, ShelfQuery>;

const createdDesc = (a: MarketplaceItem, b: MarketplaceItem) =>
  (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

/** Hidden below `min`: a shelf with one tile looks broken, not small. */
const atLeast = (items: MarketplaceItem[], min: number) => (items.length >= min ? items : []);

/**
 * `exclude` is the focused item's key: it leaves before a shelf is cut to
 * size, so the shelf still fills up and only then checks its minimum.
 */
const itemsOf = (sections: readonly MarketplaceSection[], exclude: string | null) =>
  sections.flatMap((s) => s.items).filter((i) => i.key !== exclude);

/** Landesverband shelf: the server's order across Agents and Rezepte. */
export function landesverbandShelf(
  sections: readonly MarketplaceSection[],
  exclude: string | null = null
): MarketplaceItem[] {
  const { show, min } = FRONTPAGE_SHELVES.landesverband;
  return atLeast(itemsOf(sections, exclude).slice(0, show), min);
}

/** Newest first across kinds — every section is already newest-first within its kind. */
export function newestShelf(
  sections: readonly MarketplaceSection[],
  exclude: string | null = null
): MarketplaceItem[] {
  const { show, min } = FRONTPAGE_SHELVES.neu;
  return atLeast(itemsOf(sections, exclude).sort(createdDesc).slice(0, show), min);
}

/**
 * Most liked across kinds. Only liked items count — an unliked one in a
 * „Beliebt" list would rank on nothing — so a young catalogue has no list yet.
 */
export function popularShelf(
  sections: readonly MarketplaceSection[],
  exclude: string | null = null
): MarketplaceItem[] {
  const { show, min } = FRONTPAGE_SHELVES.beliebt;
  return atLeast(
    itemsOf(sections, exclude)
      .filter((i) => i.likesCount > 0)
      .sort((a, b) => b.likesCount - a.likesCount || createdDesc(a, b))
      .slice(0, show),
    min
  );
}

/** Image kinds taken in turns, so one kind with many items does not fill the row. */
export function visualShelf(
  sections: readonly MarketplaceSection[],
  exclude: string | null = null
): MarketplaceItem[] {
  const { show, min } = FRONTPAGE_SHELVES.gestalten;
  const queues = sections.map((s) => s.items.filter((i) => i.key !== exclude));
  const out: MarketplaceItem[] = [];
  while (out.length < show && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < show) out.push(next);
    }
  }
  return atLeast(out, min);
}

/** Fallback for „Im Fokus": the newest official agent or recipe. */
export function fallbackFeature(sections: readonly MarketplaceSection[]): MarketplaceItem | null {
  return (
    sections
      .flatMap((s) => s.items)
      .filter((i) => i.origin === 'offiziell')
      .sort(createdDesc)[0] ?? null
  );
}

/**
 * The whole page from one `sections` answer per shelf. `curated` is the „Im
 * Fokus" slot with the item the viewer may see, or `null` when there is no
 * slot or its item is gone — then the newest official item stands in. The
 * featured item is not repeated under „Neu". Empty shelves are left out.
 */
export function composeFrontpage(input: {
  sections: Record<MarketplaceFrontpageShelfId, readonly MarketplaceSection[]>;
  curated: { feature: MarketplaceFeature; item: MarketplaceItem } | null;
}): MarketplaceFrontpageResponse {
  const { sections, curated } = input;
  const featured = curated?.item ?? fallbackFeature(sections.neu);
  // The featured item is not shown a second time in any shelf.
  const focusKey = featured?.key ?? null;
  const items: Record<MarketplaceFrontpageShelfId, MarketplaceItem[]> = {
    landesverband: landesverbandShelf(sections.landesverband, focusKey),
    neu: newestShelf(sections.neu, focusKey),
    beliebt: popularShelf(sections.beliebt, focusKey),
    gestalten: visualShelf(sections.gestalten, focusKey),
  };
  // Top to bottom: the enum's order is the page's.
  const shelves: MarketplaceFrontpageShelf[] = marketplaceFrontpageShelfIdSchema.options
    .filter((id) => items[id].length > 0)
    .map((shelfId) => {
      const source = sections[shelfId];
      const total = source.reduce((n, s) => n + s.items.length, 0);
      return {
        shelfId,
        items: items[shelfId],
        hasMore: source.some((s) => s.hasMore) || total > items[shelfId].length,
      };
    });
  return { featured, featureId: curated ? curated.feature.id : null, shelves };
}
