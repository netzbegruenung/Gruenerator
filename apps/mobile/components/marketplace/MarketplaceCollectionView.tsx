import { useUserProfileStore } from '@gruenerator/chat/stores';
import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  collectionAddState,
  collectionById,
  collectionCoverPath,
  emphasisParts,
  isLibraryKind,
  isSampleItem,
  marketplaceCountLabel,
  resolveStory,
  sampleImageOf,
  useMarketplaceFrontpage,
} from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { WEB_ORIGIN } from '../../services/webOrigin';
import { BODY_FONT, spacing } from '../../theme';
import { Button } from '../common/Button';
import { SkeletonRows } from '../common/Skeleton';

import { CollectionStory } from './CollectionStory';
import { marketplaceCardProps } from './kindViews';
import { MarketCard } from './MarketCard';
import {
  CollectionCards,
  DISPLAY_FONT,
  ItemShowcaseCard,
  Shelf,
  creditLine,
  showcaseToneAt,
  useTone,
  webImage,
} from './showcase';
import { type MarketplaceActions } from './useMarketplaceActions';

/** A sample entry has no detail page; it shows its picture on the web origin. */
function openSample(item: MarketplaceItem) {
  const src = sampleImageOf(item);
  if (src) void Linking.openURL(src.startsWith('/') ? `${WEB_ORIGIN}${src}` : src);
}

function ItemGrid({
  items,
  token,
  actions,
  onSelect,
}: {
  items: readonly MarketplaceItem[];
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}) {
  return (
    <View style={styles.stack}>
      {items.map((item, index) =>
        isSampleItem(item) || isLibraryKind(item.kind) ? (
          <ItemShowcaseCard
            key={item.key}
            item={item}
            tone={showcaseToneAt(index)}
            token={token}
            visual={isSampleItem(item)}
            onPress={() => (isSampleItem(item) ? openSample(item) : onSelect(item))}
          />
        ) : (
          <MarketCard
            key={item.key}
            {...marketplaceCardProps(item, token)}
            onPress={() => onSelect(item)}
            onToggleAdded={() => actions.toggleSave(item)}
          />
        )
      )}
    </View>
  );
}

/**
 * One collection opened (`?kollektion=<id>`, web: `MarketplaceCollectionView`):
 * the cover as a wide banner, the title with „Alle hinzufügen", the story or
 * every item as a card, and the other collections below. The items come from
 * the front page answer, so likes and saves stay in sync with it.
 */
export function MarketplaceCollectionView({
  id,
  token,
  actions,
  onSelect,
  onBack,
  onOpen,
}: {
  id: MarketplaceCollectionId;
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
  onBack: () => void;
  onOpen: (id: MarketplaceCollectionId) => void;
}) {
  const theme = useTheme();
  const page = useMarketplaceFrontpage({ platform: 'mobile' });
  const locale = useUserProfileStore((s) => s.locale);
  const def = collectionById(id);
  const { surface } = useTone(def?.tone ?? 'tanne');
  const collections = page.data?.collections ?? [];
  // A collection below its `min` is not in the response; one of only Vorlagen (min 0) is, empty.
  const collection = collections.find((c) => c.collectionId === id);
  const items = collection?.items ?? [];

  if (page.isPending)
    return <SkeletonRows count={3} leading={0} on="card" style={styles.loading} />;
  if (!def || !collection) {
    return (
      <View style={styles.note}>
        <Ionicons name="albums-outline" size={40} color={theme.textSecondary} />
        <Text style={[styles.noteTitle, { color: theme.text }]}>
          Diese Kollektion ist nicht verfügbar
        </Text>
        <Text style={[styles.noteText, { color: theme.textSecondary }]}>
          Vielleicht gibt es sie nicht mehr, oder ihre Inhalte sind für dich nicht sichtbar.
        </Text>
        <Button variant="outline" onPress={onBack}>
          Zum Marktplatz
        </Button>
      </View>
    );
  }

  const story = def.story?.length ? resolveStory(def.story, items, locale) : null;
  const select = (item: MarketplaceItem) =>
    isSampleItem(item) ? openSample(item) : onSelect(item);
  const add = collectionAddState(items);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.banner, { backgroundColor: surface }]}>
        {def.cover ? (
          <Image
            source={webImage(collectionCoverPath(def.cover, 1200, true))}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
            accessibilityLabel={def.cover.alt}
            priority="high"
          />
        ) : null}
        {def.cover?.credit ? (
          <Text style={styles.credit} numberOfLines={1}>
            {creditLine(def.cover.credit)}
          </Text>
        ) : null}
      </View>

      <View style={styles.header}>
        <Text style={[styles.kicker, { color: theme.textGreen }]}>{def.kicker.toUpperCase()}</Text>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {def.title}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {emphasisParts(def.description).map((part, i) =>
            part.strong ? (
              // The parts are a fixed split of a registry string; their order is their identity.
              // eslint-disable-next-line react/no-array-index-key
              <Text key={i} style={[styles.strong, { color: theme.text }]}>
                {part.text}
              </Text>
            ) : (
              part.text
            )
          )}
        </Text>
        {items.length > 0 ? (
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {marketplaceCountLabel(items.length)}
          </Text>
        ) : null}
        {add.addable.length > 0 ? (
          add.label ? (
            <Button
              variant="primary"
              onPress={() => add.missing.forEach((item) => actions.toggleSave(item))}
            >
              {add.label}
            </Button>
          ) : (
            <View style={styles.allAdded}>
              <Ionicons name="checkmark" size={16} color={theme.textSecondary} />
              <Text style={[styles.count, styles.allAddedText, { color: theme.textSecondary }]}>
                Alle bei deinen Grüneratoren
              </Text>
            </View>
          )
        ) : null}
      </View>

      {story ? (
        <>
          <CollectionStory
            blocks={story.blocks}
            token={token}
            actions={actions}
            onSelect={select}
          />
          {story.rest.length > 0 ? (
            <Shelf title="Mehr aus der Kollektion" large>
              <ItemGrid items={story.rest} token={token} actions={actions} onSelect={onSelect} />
            </Shelf>
          ) : null}
        </>
      ) : (
        <ItemGrid items={items} token={token} actions={actions} onSelect={onSelect} />
      )}

      <CollectionCards
        title="Weitere Kollektionen"
        collections={collections.filter((c) => c.collectionId !== id)}
        onOpen={onOpen}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xlarge, paddingTop: spacing.small, paddingBottom: spacing.xxlarge },
  stack: { gap: spacing.small },
  loading: { paddingTop: spacing.medium },
  banner: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  credit: {
    position: 'absolute',
    right: spacing.xsmall,
    bottom: spacing.xsmall,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontFamily: BODY_FONT,
    fontSize: 10.5,
    color: '#FFFFFF',
  },
  header: { gap: spacing.xsmall },
  kicker: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700', letterSpacing: 0.8 },
  title: { fontFamily: DISPLAY_FONT, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 },
  description: { fontFamily: BODY_FONT, fontSize: 16, lineHeight: 24 },
  strong: { fontWeight: '700' },
  count: { fontFamily: BODY_FONT, fontSize: 14 },
  allAdded: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.xsmall },
  allAddedText: { fontWeight: '700' },
  note: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xxlarge,
    paddingHorizontal: spacing.large,
  },
  noteTitle: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  noteText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
