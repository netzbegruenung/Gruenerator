import {
  marketplaceFrontpageShelfIdSchema,
  type MarketplaceCollectionId,
  type MarketplaceFrontpageCollection,
  type MarketplaceFrontpageResponse,
  type MarketplaceFrontpageShelf,
  type MarketplaceFrontpageShelfId,
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSection,
  type MarketplaceSort,
  type SharepicThema,
} from '@gruenerator/contracts';

import { type MarketplaceTarget } from './cache.js';
import { EUROPA_COLLECTION } from './collections/europa.js';
import { GLEICHSTELLUNG_COLLECTION } from './collections/gleichstellung.js';
import {
  GRUENE_JUGEND_AT_COLLECTION,
  GRUENE_JUGEND_COLLECTION,
} from './collections/grueneJugend.js';
import { QUEER_COLLECTION } from './collections/queer.js';
import { type CollectionStoryBlock } from './collectionStory.js';
import { type MarketplaceFilters } from './filters.js';
import { DEFAULT_MARKETPLACE_SORT } from './registry.js';
import { WAHLKAMPF_SAMPLES } from './sampleCollection.js';

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
    filters.collection === null &&
    filters.category === null &&
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

export interface MarketplaceCollectionFill {
  kinds: readonly MarketplaceKind[];
  sort: MarketplaceSort;
  /** Per kind, so one kind with many items does not crowd out the next. */
  limit: number;
  /** Vorlagen only: one `template_type`, e.g. the ones that open in Canva. */
  templateType?: 'canva';
}

export interface MarketplaceCollectionCover {
  /**
   * File stem under `/images/marketplace/collections/`, served as
   * `<stem>-640.webp` and `<stem>-1200.webp`. nginx serves `/images/**` as
   * immutable, so a new picture needs a new stem, never the old name.
   */
  file: string;
  alt: string;
  /** Unsplash photos name their photographer; our own pictures carry `null`. */
  credit: { author: string; profileUrl: string; photoUrl: string } | null;
}

export interface MarketplaceCollection {
  id: MarketplaceCollectionId;
  audience: 'de-DE' | 'de-AT' | 'all';
  kicker: string;
  title: string;
  /** May mark a few terms with `**…**`: bold on the collection page, plain on its card. */
  description: string;
  /** Tints the picture area when there is no cover. */
  tone: 'tanne' | 'klee' | 'sand';
  cover: MarketplaceCollectionCover | null;
  /** Hand-picked, in this order; an item the viewer may not see drops out. */
  pinned: readonly MarketplaceTarget[];
  /** Filled in after `pinned`, for content that has no stable ref across instances. */
  fill: readonly MarketplaceCollectionFill[];
  show: number;
  /** Below this many visible items the collection is left out. */
  min: number;
  /** `false`: reachable only by its link (`?kollektion=<id>`), not in the row of collections. */
  listed?: false;
  /** `themen`: in its own row „Themen“ below the other collections on the front page. */
  row?: 'themen';
  /** Entries that exist only as files, shown before everything resolved (see `sampleCollection.ts`). */
  samples?: readonly MarketplaceItem[];
  /** What the page tells between cover and entries; without one, the entries as a grid. */
  story?: readonly CollectionStoryBlock[];
}

/** The collections of the front page, curated by PR, in display order. */
export const MARKETPLACE_COLLECTIONS = [
  {
    id: 'starter',
    audience: 'all',
    kicker: 'Zum Einstieg',
    title: 'Starterpaket',
    description:
      'Die Agents und Rezepte, mit denen die meisten anfangen: Pressemitteilung, Social Media, Anträge und Antworten an Bürger*innen.',
    tone: 'tanne',
    cover: {
      file: 'starter-v1',
      alt: 'Eine junge Pflanze mit wenigen Blättern vor einer hellen Wand',
      credit: {
        author: 'Igor Son',
        profileUrl: 'https://unsplash.com/@igorson?utm_source=gruenerator&utm_medium=referral',
        photoUrl:
          'https://unsplash.com/photos/green-leaf-plant-FV_PxCqgtwc?utm_source=gruenerator&utm_medium=referral',
      },
    },
    pinned: [
      { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
      { kind: 'recipe', ref: 'presse' },
      { kind: 'recipe', ref: 'instagram' },
      { kind: 'agent', ref: 'gruenerator-antrag' },
      { kind: 'recipe', ref: 'antrag' },
      { kind: 'agent', ref: 'gruenerator-rede-schreiber' },
      { kind: 'agent', ref: 'gruenerator-buergerservice' },
      { kind: 'recipe', ref: 'buergermail' },
    ],
    fill: [],
    show: 8,
    min: 3,
  },
  {
    id: 'barrierefreiheit',
    audience: 'all',
    kicker: 'Für alle verständlich',
    title: 'Barrierefrei kommunizieren',
    description:
      'Texte in Einfacher und Leichter Sprache, damit eure Beschlüsse, Einladungen und Pressetexte alle erreichen.',
    tone: 'klee',
    cover: {
      file: 'barrierefreiheit-v1',
      alt: 'Ein helles Treppenhaus mit Handlauf unter einem Oberlicht',
      credit: {
        author: 'Fluxtonia',
        profileUrl: 'https://unsplash.com/@fluxtonia?utm_source=gruenerator&utm_medium=referral',
        photoUrl:
          'https://unsplash.com/photos/a-staircase-with-a-skylight-above-it-nyvOrbNgRlc?utm_source=gruenerator&utm_medium=referral',
      },
    },
    pinned: [
      { kind: 'agent', ref: 'gruenerator-leichte-sprache' },
      { kind: 'agent', ref: 'gruenerator-einfache-sprache' },
    ],
    fill: [],
    show: 6,
    min: 2,
  },
  {
    id: 'canva',
    audience: 'all',
    kicker: 'Weiter in Canva',
    title: 'Für Canva',
    description:
      'Vorlagen, die sich direkt in Canva öffnen, dazu Sticker und Hintergründe für eure eigenen Designs.',
    tone: 'sand',
    cover: {
      file: 'canva-v1',
      alt: 'Eine salbeigrüne Wand mit leeren weißen Blättern im Raster, daneben eine Pflanze am Fenster',
      credit: null,
    },
    pinned: [],
    fill: [
      { kinds: ['template'], sort: 'beliebt', limit: 5, templateType: 'canva' },
      { kinds: ['sticker', 'background'], sort: 'beliebt', limit: 2 },
    ],
    show: 8,
    min: 3,
  },
  {
    id: 'wahlkampf-moritz',
    audience: 'all',
    kicker: 'Musterkollektion',
    title: 'Wahlkampf für Moritz',
    description:
      'So kann ein Wahlkampf-Paket aussehen: Vorlagen für Plakat, Sharepic, Story und Flyer, passende Hintergründe und Sticker, dazu die Agents und Rezepte für die Texte.',
    tone: 'klee',
    cover: {
      file: 'wahlkampf-v1',
      alt: 'Ein Infostand mit Sonnenblumen auf einem Marktplatz am Morgen',
      credit: null,
    },
    pinned: [
      { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
      { kind: 'recipe', ref: 'presse' },
      { kind: 'recipe', ref: 'instagram' },
      { kind: 'agent', ref: 'gruenerator-rede-schreiber' },
    ],
    fill: [],
    samples: WAHLKAMPF_SAMPLES,
    show: 14,
    min: 1,
    listed: false,
  },
  GLEICHSTELLUNG_COLLECTION,
  QUEER_COLLECTION,
  EUROPA_COLLECTION,
  GRUENE_JUGEND_COLLECTION,
  GRUENE_JUGEND_AT_COLLECTION,
] as const satisfies readonly MarketplaceCollection[];

export function collectionsFor(locale: string | null): readonly MarketplaceCollection[] {
  const audience = locale === 'de-AT' ? 'de-AT' : 'de-DE';
  return MARKETPLACE_COLLECTIONS.filter((c) => c.audience === 'all' || c.audience === audience);
}

export function collectionById(id: MarketplaceCollectionId | null): MarketplaceCollection | null {
  return MARKETPLACE_COLLECTIONS.find((c) => c.id === id) ?? null;
}

/** The listed collection that shows the Vorlagen of `thema`, for the way back from a Vorlage. */
export function collectionForThema(thema: SharepicThema): MarketplaceCollection | null {
  const collections: readonly MarketplaceCollection[] = MARKETPLACE_COLLECTIONS;
  return (
    collections.find(
      (c) =>
        c.listed !== false &&
        c.story?.some((block) => block.type === 'vorlagen' && block.thema === thema)
    ) ?? null
  );
}

/**
 * „Passt dazu" under an item: the listed collections it appears in, then the
 * other entries of those collections in their order, each once, without the
 * item itself. Empty when the item is in no collection.
 */
export function relatedFromCollections(
  collections: readonly {
    collectionId: MarketplaceCollectionId;
    items: readonly MarketplaceItem[];
  }[],
  target: MarketplaceTarget,
  limit: number
): { collections: readonly MarketplaceCollection[]; items: readonly MarketplaceItem[] } {
  const isTarget = (i: MarketplaceItem) => i.kind === target.kind && i.ref === target.ref;
  const containing = collections.filter(
    (c) => collectionById(c.collectionId)?.listed !== false && c.items.some(isTarget)
  );
  const items = new Map<string, MarketplaceItem>();
  for (const item of containing.flatMap((c) => c.items)) {
    if (items.size === limit) break;
    if (!isTarget(item) && !items.has(item.key)) items.set(item.key, item);
  }
  return {
    collections: containing.flatMap((c) => collectionById(c.collectionId) ?? []),
    items: [...items.values()],
  };
}

/**
 * One collection from its resolved parts: samples first, then pinned, then each fill, each
 * item once, cut to `show`; `null` below `min`.
 */
export function composeCollection(
  collection: MarketplaceCollection,
  resolved: readonly (readonly (MarketplaceItem | null)[])[]
): MarketplaceFrontpageCollection | null {
  const seen = new Set<string>();
  const items: MarketplaceItem[] = [];
  for (const item of [...(collection.samples ?? []), ...resolved.flat()]) {
    if (!item || seen.has(item.key) || items.length >= collection.show) continue;
    seen.add(item.key);
    items.push(item);
  }
  return items.length >= collection.min ? { collectionId: collection.id, items } : null;
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
/**
 * A picture of its own. „Zum Gestalten" is about pictures: a Vorlage without
 * one is drawn as a mock sheet, a sticker or background without one leaves.
 */
export function hasPreview(item: MarketplaceItem): boolean {
  if (item.kind === 'sticker' || item.kind === 'background')
    return Boolean(item.asset.thumbUrl ?? item.asset.src);
  return item.thumbnailUrl !== null;
}

export function visualShelf(
  sections: readonly MarketplaceSection[],
  exclude: string | null = null
): MarketplaceItem[] {
  const { show, min } = FRONTPAGE_SHELVES.gestalten;
  const queues = sections.map((s) =>
    s.items.filter((i) => i.key !== exclude && (i.kind === 'template' || hasPreview(i)))
  );
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
  collections: MarketplaceFrontpageCollection[];
}): MarketplaceFrontpageResponse {
  const { sections, curated, collections } = input;
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
  return { featured, featureId: curated ? curated.feature.id : null, shelves, collections };
}
