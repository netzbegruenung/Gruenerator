import {
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceListResponse,
  type MarketplaceSection,
} from '@gruenerator/contracts';
import { type InfiniteData } from '@tanstack/react-query';

import { USER_LIBRARY_QUERY_KEY } from '../grueneratoren/userLibrary.js';
import { toggledLike } from '../studio-assets/cache.js';
import { STUDIO_ASSETS_QUERY_KEY } from '../studio-assets/useStudioAssets.js';

/**
 * `useMarketplaceSections` caches the plain response, `useMarketplaceKind` its
 * pages, `useMarketplaceItem` the one item.
 */
export type MarketplaceCacheData =
  MarketplaceListResponse | InfiniteData<MarketplaceListResponse, number> | MarketplaceItem;

export interface MarketplaceTarget {
  kind: MarketplaceKind;
  ref: string;
}

type ItemPatch = (item: MarketplaceItem) => MarketplaceItem;

function patchSections(
  sections: MarketplaceSection[],
  target: MarketplaceTarget,
  patch: ItemPatch
): MarketplaceSection[] {
  return sections.map((section) =>
    section.kind === target.kind && section.items.some((i) => i.ref === target.ref)
      ? {
          ...section,
          items: section.items.map((i) => (i.ref === target.ref ? patch(i) : i)),
        }
      : section
  );
}

/** Applies `patch` to the target item in either cache shape; everything else keeps its identity. */
export function patchMarketplaceCache<D extends MarketplaceCacheData>(
  data: D,
  target: MarketplaceTarget,
  patch: ItemPatch
): D {
  if ('kind' in data) {
    // Boundary cast: in this branch `D` is the item shape, and `patch` keeps it.
    return (data.kind === target.kind && data.ref === target.ref ? patch(data) : data) as D;
  }
  if ('pages' in data) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        sections: patchSections(page.sections, target, patch),
      })),
    };
  }
  return { ...data, sections: patchSections(data.sections, target, patch) };
}

/** Sets the like state; a sticker or background carries it twice (item and `asset`). */
export function withLike(
  item: MarketplaceItem,
  liked: boolean,
  likesCount: number
): MarketplaceItem {
  if (item.kind === 'sticker' || item.kind === 'background')
    return { ...item, liked, likesCount, asset: { ...item.asset, liked, likesCount } };
  return { ...item, liked, likesCount };
}

export function withSaved(item: MarketplaceItem, saved: boolean): MarketplaceItem {
  if (item.kind === 'sticker' || item.kind === 'background')
    return { ...item, saved, asset: { ...item.asset, favorited: saved } };
  return { ...item, saved };
}

export function likeToggled(item: MarketplaceItem): MarketplaceItem {
  const { liked, likesCount } = toggledLike(item);
  return withLike(item, liked, likesCount);
}

export const saveToggled = (item: MarketplaceItem): MarketplaceItem => withSaved(item, !item.saved);

// Keys owned by apps/web (useEntityLikes, useEntityFavorites, useTemplateEngagement,
// VorlagenGallery); spelled out here because shared cannot import from an app.
const TEMPLATE_LIKED_IDS_KEY = ['entityLikes', 'template'] as const;
const TEMPLATE_ENGAGEMENT_KEY = ['templateEngagement'] as const;
const TEMPLATE_FAVORITES_KEY = ['templateFavorites'] as const;
const VORLAGEN_GALLERY_KEY = ['vorlagen-gallery'] as const;

/**
 * What else shows the same like or save, outside the Marktplatz: „Meine
 * Grüneratoren" for Agents/Rezepte, `/vorlagen` for Vorlagen, the sticker
 * gallery for Sticker/Hintergründe.
 */
export function relatedQueryKeys(
  kind: MarketplaceKind,
  action: 'like' | 'save'
): readonly (readonly string[])[] {
  switch (kind) {
    case 'agent':
    case 'recipe':
      return action === 'save' ? [USER_LIBRARY_QUERY_KEY] : [];
    case 'template':
      return action === 'save'
        ? [TEMPLATE_FAVORITES_KEY, VORLAGEN_GALLERY_KEY]
        : [TEMPLATE_LIKED_IDS_KEY, TEMPLATE_ENGAGEMENT_KEY, VORLAGEN_GALLERY_KEY];
    case 'sticker':
    case 'background':
      return [STUDIO_ASSETS_QUERY_KEY];
    case 'notebook':
      // „Gemerkt" on /notebooks reads the Marktplatz query itself.
      return [];
  }
}
