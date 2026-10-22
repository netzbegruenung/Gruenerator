import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  collectionCoverPath,
  relatedFromCollections,
  useMarketplaceFrontpage,
} from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, spacing } from '../../theme';
import { AgentGlyph } from '../agentura/AgentGlyph';
import { Button } from '../common/Button';

import { kindView, marketplaceCardProps } from './kindViews';
import { MarketplaceDiscussion } from './MarketplaceDiscussion';
import {
  DISPLAY_FONT,
  Shelf,
  SwipeRow,
  showcaseToneAt,
  useTone,
  webImage,
  type ShowcaseTone,
} from './showcase';
import { type MarketplaceActions } from './useMarketplaceActions';

/** How many neighbours „Passt dazu" shows after the collections. */
const RELATED_LIMIT = 8;

/**
 * One Marktplatz item up close, in place of the list (web:
 * `MarketplaceItemDetail`, calm after the App Store's product page): the icon,
 * what it is, the ways on — keep it, try it, open it — then a Vorlage's pages
 * or the picture, the interaction block every kind shares (like, share,
 * report, reactions, comments), and „Passt dazu": the collections holding the
 * item, then their other entries, as one row.
 */
export function MarketplaceItemDetail({
  item,
  token,
  actions,
  onBack,
  backLabel = 'Marktplatz',
  shareUrl,
  allowReport,
  onSelect,
  onOpenCollection,
}: {
  item: MarketplaceItem;
  token: string | null;
  actions: MarketplaceActions;
  onBack: () => void;
  /** The back link's text: where it leads. */
  backLabel?: string;
  /** Where „Teilen" points: the web Marktplatz with this item open. */
  shareUrl: string;
  /** Off inside a sheet: the report form would be a modal over the modal. */
  allowReport: boolean;
  /** Opens a neighbour from „Passt dazu"; left out, the row stays away. */
  onSelect?: (item: MarketplaceItem) => void;
  /** Opens a collection; left out (the sheet), the row shows only entries. */
  onOpenCollection?: (id: MarketplaceCollectionId) => void;
}) {
  const theme = useTheme();
  const card = marketplaceCardProps(item, token);
  const view = kindView(item.kind);
  const library = view.toggle === 'library';
  const { DetailExtras } = view;
  const large = item.kind === 'template' || item.kind === 'background' || item.kind === 'sticker';

  return (
    <ScrollView
      contentContainerStyle={styles.detail}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Zurück: ${backLabel}`}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={18} color={theme.textGreen} />
        <Text style={[styles.backText, { color: theme.textGreen }]}>{backLabel}</Text>
      </Pressable>

      <View style={styles.header}>
        {large ? null : (
          <View style={[styles.icon, { backgroundColor: theme.backgroundAlt }]}>
            <AgentGlyph iconKey={card.iconKey} size={44} color={theme.textGreen} />
          </View>
        )}
        <View style={styles.titles}>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{card.meta}</Text>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {card.title}
          </Text>
        </View>
      </View>
      {card.description ? (
        <Text style={[styles.body, { color: theme.textSecondary }]}>{card.description}</Text>
      ) : null}

      <View style={styles.actions}>
        {card.added !== null ? (
          <Button
            variant={card.added ? 'outline' : 'primary'}
            onPress={() => actions.toggleSave(item)}
          >
            {library
              ? card.added
                ? 'In meinen Grüneratoren'
                : 'Zu meinen Grüneratoren'
              : card.added
                ? 'Gemerkt'
                : 'Merken'}
          </Button>
        ) : null}
        {item.kind === 'agent' || item.kind === 'recipe' ? (
          <>
            <Button variant="ghost" onPress={() => actions.startChat(item)}>
              Im Chat ausprobieren
            </Button>
            <Button variant="ghost" onPress={() => actions.open(item)}>
              Alle Details
            </Button>
          </>
        ) : item.kind === 'template' ? (
          <Button variant="ghost" onPress={() => actions.open(item)}>
            Vorlage öffnen
          </Button>
        ) : item.kind === 'notebook' ? (
          <Button variant="ghost" onPress={() => actions.open(item)}>
            Notebook öffnen
          </Button>
        ) : (
          <Button variant="ghost" onPress={() => actions.toProfilbild(item)}>
            Im Profilbild verwenden
          </Button>
        )}
      </View>

      {DetailExtras ? (
        <DetailExtras item={item} />
      ) : large && card.image ? (
        <View style={[styles.preview, { backgroundColor: theme.backgroundAlt }]}>
          <Image
            source={card.image}
            contentFit={card.imageFit === 'contain' ? 'contain' : 'cover'}
            style={card.imageFit === 'contain' ? styles.previewContain : StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      <View style={[styles.rule, { backgroundColor: theme.cardBorder }]} />

      <MarketplaceDiscussion
        target={{ kind: item.kind, ref: item.ref }}
        item={item}
        canModerate={item.isOwn}
        shareUrl={shareUrl}
        allowReport={allowReport}
      />

      {onSelect ? (
        <Related
          item={item}
          token={token}
          onSelect={onSelect}
          onOpenCollection={onOpenCollection}
        />
      ) : null}
    </ScrollView>
  );
}

/** „Passt dazu": the item's collections first, then their other entries. */
function Related({
  item,
  token,
  onSelect,
  onOpenCollection,
}: {
  item: MarketplaceItem;
  token: string | null;
  onSelect: (item: MarketplaceItem) => void;
  onOpenCollection?: (id: MarketplaceCollectionId) => void;
}) {
  const theme = useTheme();
  const page = useMarketplaceFrontpage({ platform: 'mobile' });
  const related = relatedFromCollections(
    page.data?.collections ?? [],
    { kind: item.kind, ref: item.ref },
    RELATED_LIMIT
  );
  const collections = onOpenCollection ? related.collections : [];
  if (collections.length === 0 && related.items.length === 0) return null;

  return (
    <>
      <View style={[styles.rule, { backgroundColor: theme.cardBorder }]} />
      <Shelf title="Passt dazu">
        <SwipeRow label="Passt dazu">
          {collections.map((collection) => (
            <Tile
              key={collection.id}
              title={collection.title}
              meta="Kollektion"
              tone={collection.tone}
              onPress={() => onOpenCollection?.(collection.id)}
              media={
                collection.cover ? (
                  <Image
                    source={webImage(collectionCoverPath(collection.cover, 640))}
                    contentFit="cover"
                    style={StyleSheet.absoluteFill}
                  />
                ) : null
              }
            />
          ))}
          {related.items.map((entry, index) => {
            const entryCard = marketplaceCardProps(entry, token);
            return (
              <Tile
                key={entry.key}
                title={entry.title}
                meta={kindView(entry.kind).label}
                tone={showcaseToneAt(index + 1)}
                onPress={() => onSelect(entry)}
                media={
                  entryCard.image ? (
                    <Image
                      source={entryCard.image}
                      contentFit={entryCard.imageFit}
                      style={
                        entryCard.imageFit === 'contain'
                          ? styles.tileContain
                          : StyleSheet.absoluteFill
                      }
                    />
                  ) : (
                    <TileIcon iconKey={entryCard.iconKey} tone={showcaseToneAt(index + 1)} />
                  )
                }
              />
            );
          })}
        </SwipeRow>
      </Shelf>
    </>
  );
}

function TileIcon({ iconKey, tone }: { iconKey: string | null; tone: ShowcaseTone }) {
  const { ink } = useTone(tone);
  return <AgentGlyph iconKey={iconKey} size={36} color={ink} />;
}

function Tile({
  title,
  meta,
  media,
  tone,
  onPress,
}: {
  title: string;
  meta: string;
  media: ReactNode;
  tone: ShowcaseTone;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { surface } = useTone(tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={meta}
      style={({ pressed }) => [styles.tile, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View style={[styles.tileMedia, { backgroundColor: surface }]}>{media}</View>
      <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.tileMeta, { color: theme.textSecondary }]}>{meta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  detail: {
    gap: spacing.large,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.xlarge,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: 44,
    marginBottom: -spacing.small,
  },
  backText: { fontFamily: BODY_FONT, fontSize: 15 },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.xlarge,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContain: { width: '80%', height: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.04)',
  },
  titles: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: DISPLAY_FONT, fontSize: 26, lineHeight: 29, letterSpacing: -0.4 },
  meta: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  actions: { gap: spacing.small },
  body: { fontFamily: BODY_FONT, fontSize: 16, lineHeight: 24 },
  rule: { height: StyleSheet.hairlineWidth },
  tile: { width: 150, gap: 6 },
  tileMedia: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileContain: { width: '80%', height: '80%' },
  tileTitle: { fontFamily: DISPLAY_FONT, fontSize: 15 },
  tileMeta: { fontFamily: BODY_FONT, fontSize: 12 },
});
