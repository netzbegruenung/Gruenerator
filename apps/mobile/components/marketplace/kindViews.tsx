import {
  type MarketplaceItem,
  type MarketplaceItemOf,
  type MarketplaceKind,
} from '@gruenerator/contracts';
import { agenturaMetaLine } from '@gruenerator/shared/agents';
import { toCardModel } from '@gruenerator/shared/marketplace';
import { isShareSrc } from '@gruenerator/shared/stickers';
import { Image, type ImageSource } from 'expo-image';
import { useState, type ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { vorlageImageUri } from '../../services/vorlagen';
import { BODY_FONT, borderRadius } from '../../theme';
import { galleryTilePath } from '../profilbild/galleryModel';

import { templatePageUris } from './marketplaceTarget';

interface KindView<I extends MarketplaceItem> {
  /** The singular, first in the card's meta line. */
  label: string;
  /** `library`: „Zu meinen Grüneratoren"; `bookmark`: „Merken". */
  toggle: 'library' | 'bookmark';
  imageFit: 'cover' | 'contain';
  /** The picture in the card's media area; `null` draws the icon. */
  // Method syntax on purpose: bivariant, so each kind's view fits the lookup below.
  image(item: I, token: string | null): ImageSource | null;
  /**
   * Optional: what only this kind shows in the detail, in place of the plain
   * picture (a Vorlage's pages). Everything else in the detail is the same for all.
   */
  DetailExtras?: (props: { item: I }) => ReactElement | null;
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
      const uri = vorlageImageUri({ url: item.thumbnailUrl, thumbUrl: item.template.thumbUrl });
      return uri ? { uri } : null;
    },
    DetailExtras: TemplatePages,
  },
  sticker: { label: 'Sticker', toggle: 'bookmark', imageFit: 'contain', image: assetImage },
  background: { label: 'Hintergrund', toggle: 'bookmark', imageFit: 'cover', image: assetImage },
  notebook: { label: 'Notebook', toggle: 'bookmark', imageFit: 'cover', image: noImage },
};

/**
 * Every page of a Vorlage, swiped one at a time, with „Seite 2 von 3" below once
 * there is more than one — the pager of the web detail (`TemplatePages`).
 */
function TemplatePages({ item }: { item: MarketplaceItemOf<'template'> }) {
  const theme = useTheme();
  const pages = templatePageUris(item, (image) => vorlageImageUri(image, 800));
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  if (pages.length === 0) return null;

  return (
    <View style={styles.pages}>
      <View
        style={[styles.stage, { backgroundColor: theme.backgroundAlt }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(
                Math.min(
                  pages.length - 1,
                  Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width))
                )
              )
            }
          >
            {pages.map((uri, i) => (
              <Image
                // Pages have no id and may repeat an image URL; order is the identity.
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                source={{ uri }}
                contentFit="contain"
                style={{ width, height: '100%' }}
                accessibilityLabel={`Seite ${i + 1} von ${pages.length}`}
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {pages.length > 1 ? (
        <Text style={[styles.pageCount, { color: theme.textSecondary }]}>
          {`Seite ${page + 1} von ${pages.length}`}
        </Text>
      ) : null}
    </View>
  );
}

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

const styles = StyleSheet.create({
  pages: { gap: 6 },
  stage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
  },
  pageCount: { fontFamily: BODY_FONT, fontSize: 13, textAlign: 'center' },
});
