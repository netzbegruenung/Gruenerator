import { type MarketplaceItem, type MarketplaceItemOf } from '@gruenerator/contracts';

import { type GalleryAsset } from '../stickers/galleryAsset.js';

import { MARKETPLACE_ORIGIN_BADGE } from './registry.js';

/** What every card shows, the same on web and mobile. */
export interface MarketplaceCardModel {
  key: string;
  kind: MarketplaceItem['kind'];
  title: string;
  description: string | null;
  /** The author of public content; official content has none. */
  subtitle: string | null;
  thumbnailUrl: string | null;
  iconKey: string | null;
  /** „Offiziell"/„Landesverband"; public content carries its author instead. */
  badge: string | null;
  likesCount: number;
  liked: boolean;
  saved: boolean;
}

export function toCardModel(item: MarketplaceItem): MarketplaceCardModel {
  const assetImage =
    item.kind === 'sticker' || item.kind === 'background'
      ? (item.asset.thumbUrl ?? item.asset.src)
      : null;
  return {
    key: item.key,
    kind: item.kind,
    title: item.title,
    description: item.description,
    subtitle: item.authorName,
    thumbnailUrl: item.thumbnailUrl ?? assetImage,
    iconKey: item.iconKey,
    badge: MARKETPLACE_ORIGIN_BADGE[item.origin],
    likesCount: item.likesCount,
    liked: item.liked,
    saved: item.saved,
  };
}

/** What the Profilbild pickers take from a sticker or background. */
export function toGalleryAsset(
  item: MarketplaceItemOf<'sticker'> | MarketplaceItemOf<'background'>
): GalleryAsset {
  const { id, kind, src, title, width, height } = item.asset;
  return { id, kind, src, title, width, height };
}

/**
 * Where a card leads. Agents and Rezepte keep their Agentura product pages;
 * a Grünerator-Vorlage opens `/vorlagen/v/<id>`, an external one its own URL.
 * Sticker and Hintergründe have no page — `null`, the card opens in place.
 */
export function itemHref(item: MarketplaceItem): string | null {
  switch (item.kind) {
    case 'agent':
      return `/agentura/agent/${encodeURIComponent(item.agent.slug)}`;
    case 'recipe':
      // `/agentura/rezept/:mention` resolves catalogue, own and public recipes by mention.
      return `/agentura/rezept/${encodeURIComponent(item.recipe.mention)}`;
    case 'template':
      return item.template.templateType === 'gruenerator'
        ? `/vorlagen/v/${encodeURIComponent(item.ref)}`
        : item.template.externalUrl;
    case 'sticker':
    case 'background':
      return null;
  }
}

/** Official content cannot be reported, and nobody reports their own. */
export function canReport(
  item: MarketplaceItem
): item is MarketplaceItem & { reportKind: NonNullable<MarketplaceItem['reportKind']> } {
  return item.reportKind !== null && !item.isOwn;
}
