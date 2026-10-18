import {
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceSection,
} from '@gruenerator/contracts';

import { type MarketplaceTarget } from './cache.js';
import { type MarketplaceFilters } from './filters.js';
import { DEFAULT_MARKETPLACE_SORT } from './registry.js';

/**
 * The Marktplatz front page — what „Start" shows instead of one aisle per kind.
 * Small on purpose: every shelf hides itself below its minimum, so a thin
 * catalogue reads as a short page rather than a page of half-empty rows.
 * A new shelf is a new entry here plus its rendering, not a new request shape —
 * each one is a `sections` query with its own kinds, origin and sort.
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
