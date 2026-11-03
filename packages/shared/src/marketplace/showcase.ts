import {
  type MarketplaceCollectionId,
  type MarketplaceItem,
  type MarketplaceKind,
} from '@gruenerator/contracts';

import {
  getLandesverbandHubs,
  getLandesverbandHubsByIds,
  type LvHub,
} from '../agents/landesverbandHubs.js';
import { DEFAULT_INSTANCE_ID, type InstanceId } from '../instances/index.js';

import { type MarketplaceCategory } from './categories.js';
import {
  collectionById,
  type MarketplaceCollection,
  type MarketplaceCollectionCover,
} from './frontpage.js';
import { LANDESVERBAND_COVER_DIR } from './landesverbandCovers.js';

/**
 * What the Marktplatz pages show beyond the lists — collections, categories,
 * Landesverbände — as data both clients draw: paths, selections, labels.
 * Paths are origin-relative; the web serves the files, the app prefixes the web origin.
 */

const COLLECTION_DIR = '/images/marketplace/collections';
const CATEGORY_DIR = '/images/marketplace/kategorien';

/** A collection cover: 16:9 for a card (640, 1200), the 3:1 `banner` strip up to 2400. */
export const collectionCoverPath = (
  cover: MarketplaceCollectionCover,
  width: 640 | 1200 | 1920 | 2400,
  banner = false
): string => `${COLLECTION_DIR}/${cover.file}${banner ? '-banner' : ''}-${width}.webp`;

/** A category tile, 16:9. */
export const categoryCoverPath = (category: MarketplaceCategory, width: 640 | 1200): string =>
  `${CATEGORY_DIR}/${category.cover.file}-${width}.webp`;

/** A Landesverband's 3:1 page banner. */
export const landesverbandBannerPath = (
  cover: MarketplaceCollectionCover,
  width: 640 | 1200 | 1920 | 2400
): string => `${LANDESVERBAND_COVER_DIR}/${cover.file}-${width}.webp`;

export const marketplaceCountLabel = (n: number): string =>
  `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`;

/** A description in parts, `strong` for the terms marked `**…**`. */
export const emphasisParts = (text: string): { text: string; strong: boolean }[] =>
  text
    .split('**')
    .map((part, i) => ({ text: part, strong: i % 2 === 1 }))
    .filter((part) => part.text !== '');

/** A description without its `**` marks, for a card. */
export const plainEmphasis = (text: string): string => text.replaceAll('**', '');

/** Agents and Rezepte land in „Meine Grüneratoren"; everything else is only „Merken". */
export const isLibraryKind = (kind: MarketplaceKind): boolean =>
  kind === 'agent' || kind === 'recipe';

/**
 * The cards of a front page row: listed collections only (an unlisted one is
 * shared by its link), and only those of `row` (`rest`: without one); all when left out.
 */
export function collectionCardsFor(
  collections: readonly { collectionId: MarketplaceCollectionId; items: MarketplaceItem[] }[],
  row?: NonNullable<MarketplaceCollection['row']> | 'rest'
): { def: MarketplaceCollection; items: MarketplaceItem[] }[] {
  return collections.flatMap((c) => {
    const def = collectionById(c.collectionId);
    if (!def || def.listed === false) return [];
    if (row && (def.row ?? 'rest') !== row) return [];
    return [{ def, items: c.items }];
  });
}

/** The card's meta line: the kicker, with the count once there are entries. */
export const collectionMetaLine = (def: MarketplaceCollection, count: number): string =>
  count > 0 ? `${def.kicker} · ${marketplaceCountLabel(count)}` : def.kicker;

/**
 * „Alle hinzufügen" on a collection: what can go to „Meine Grüneratoren", and
 * what of that is not there yet. `label` is `null` once everything is added.
 */
export function collectionAddState(items: readonly MarketplaceItem[]): {
  addable: MarketplaceItem[];
  missing: MarketplaceItem[];
  label: string | null;
} {
  const addable = items.filter((item) => isLibraryKind(item.kind));
  const missing = addable.filter((item) => !item.saved);
  const label =
    missing.length === 0
      ? null
      : missing.length === addable.length
        ? `Alle ${addable.length} hinzufügen`
        : `${missing.length} weitere hinzufügen`;
  return { addable, missing, label };
}

/** The Landesverbände of the viewer's country, their own first. */
export function landesverbandHubsOwnFirst(
  locale: string,
  lvIds: readonly string[] | null,
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): { hub: LvHub; own: boolean }[] {
  const own = new Set(lvIds ?? []);
  return [...getLandesverbandHubs(locale, instanceId)]
    .map((hub) => ({ hub, own: own.has(hub.lvId) }))
    .sort((a, b) => Number(b.own) - Number(a.own));
}

/** Exactly one Landesverband: its page instead of the filtered list behind „Alle anzeigen". */
export function singleLandesverbandHub(
  lvIds: readonly string[] | null,
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): LvHub | null {
  const hubs = getLandesverbandHubsByIds(lvIds ?? [], instanceId);
  return lvIds?.length === 1 && hubs.length === 1 ? hubs[0]! : null;
}

/** A hub's Agents in hub order (Öffentlichkeitsarbeit, Bürger*innen, Wahlprüfsteine, …). */
export function sortByHubOrder<T extends Pick<MarketplaceItem, 'ref'>>(
  hub: LvHub,
  items: readonly T[]
): T[] {
  const ids = hub.agentIds as readonly string[];
  const rank = (ref: string) => {
    const index = ids.indexOf(ref);
    return index === -1 ? ids.length : index;
  };
  return [...items].sort((a, b) => rank(a.ref) - rank(b.ref));
}
