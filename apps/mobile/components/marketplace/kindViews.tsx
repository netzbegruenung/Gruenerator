import {
  type MarketplaceItem,
  type MarketplaceItemOf,
  type MarketplaceKind,
} from '@gruenerator/contracts';
import { agenturaMetaLine } from '@gruenerator/shared/agents';
import { toCardModel } from '@gruenerator/shared/marketplace';
import { isShareSrc } from '@gruenerator/shared/stickers';
import { type ImageSource } from 'expo-image';

import { resolveChatUrl } from '../../services/chatApiUrl';
import { getPublicImageUrl } from '../../services/vorlagen';
import { galleryTilePath } from '../profilbild/galleryModel';

interface KindView<I extends MarketplaceItem> {
  /** The singular, first in the card's meta line. */
  label: string;
  /** `library`: „Zu meinen Grüneratoren"; `bookmark`: „Merken". */
  toggle: 'library' | 'bookmark';
  imageFit: 'cover' | 'contain';
  /** The picture in the card's media area; `null` draws the icon. */
  // Method syntax on purpose: bivariant, so each kind's view fits the lookup below.
  image(item: I, token: string | null): ImageSource | null;
}

const noImage = () => null;

function assetImage(
  item: MarketplaceItemOf<'sticker'> | MarketplaceItemOf<'background'>,
  token: string | null
): ImageSource | null {
  const path = galleryTilePath(item.asset);
  if (!isShareSrc(path)) return { uri: resolveChatUrl(path) };
  // Share paths need the bearer token; until it is loaded the card shows its icon.
  return token
    ? { uri: resolveChatUrl(path), headers: { Authorization: `Bearer ${token}` } }
    : null;
}

/** What differs per kind — the one place that knows. Frame, text and actions are the same card. */
const KIND_VIEWS: { [K in MarketplaceKind]: KindView<MarketplaceItemOf<K>> } = {
  agent: { label: 'Agent', toggle: 'library', imageFit: 'cover', image: noImage },
  recipe: { label: 'Rezept', toggle: 'library', imageFit: 'cover', image: noImage },
  template: {
    label: 'Vorlage',
    toggle: 'bookmark',
    imageFit: 'cover',
    image: (item) => {
      const uri = getPublicImageUrl(item.thumbnailUrl ?? undefined);
      return uri ? { uri } : null;
    },
  },
  sticker: { label: 'Sticker', toggle: 'bookmark', imageFit: 'contain', image: assetImage },
  background: { label: 'Hintergrund', toggle: 'bookmark', imageFit: 'cover', image: assetImage },
};

export function kindView(kind: MarketplaceKind): KindView<MarketplaceItem> {
  // Each entry takes its own kind; `item.kind` picks the entry, which `K` cannot carry.
  return KIND_VIEWS[kind] as KindView<MarketplaceItem>;
}

/** Everything a `MarketCard` shows for an item. */
export function marketplaceCardProps(item: MarketplaceItem, token: string | null) {
  const view = kindView(item.kind);
  const card = toCardModel(item);
  return {
    iconKey: card.iconKey,
    title: card.title,
    meta: agenturaMetaLine([
      view.label,
      card.badge ?? card.subtitle,
      card.likesCount > 0 && `${card.likesCount} ♥`,
    ]),
    description: card.description ?? undefined,
    image: view.image(item, token),
    imageFit: view.imageFit,
    toggle: view.toggle,
    // Own Agents and Rezepte already stand among the own Grüneratoren.
    added: view.toggle === 'library' && item.isOwn ? null : card.saved,
  };
}
