import { type MarketplaceItem, type SharepicThema } from '@gruenerator/contracts';
import { getFriend, getRobotAvatarUrl } from '@gruenerator/shared/avatar';
import { isSampleItem, type ResolvedStoryBlock } from '@gruenerator/shared/marketplace';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSharepicVorlagen } from '../../hooks/useSharepicVorlagen';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsSheetStore } from '../../stores/settingsSheetStore';
import { BODY_FONT, colors, spacing } from '../../theme';
import { AgentGlyph } from '../agentura/AgentGlyph';
import { vorlageAspectRatio, vorlageThumbSource } from '../vorlagen/vorlageThumb';

import { kindView, marketplaceCardProps } from './kindViews';
import { DISPLAY_FONT } from './showcase';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * A collection's story (web: `CollectionStory`, docs/CLAUDE-collections.md):
 * text, claims and quotes in the reading column, galleries sideways, the
 * entries as rows. The only pictures are the entries themselves.
 */

/** Tile height of every gallery: entries and Vorlagen line up on it. */
const GALLERY_HEIGHT = 250;

interface ItemProps {
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}

function saveLabel(item: MarketplaceItem) {
  const library = kindView(item.kind).toggle === 'library';
  if (library) return item.saved ? 'In meinen Grüneratoren' : 'Hinzufügen';
  return item.saved ? 'Gemerkt' : 'Merken';
}

function SaveButton({
  item,
  actions,
  indent = false,
}: {
  item: MarketplaceItem;
  actions: MarketplaceActions;
  /** In a row: under the text, past the seal. */
  indent?: boolean;
}) {
  const theme = useTheme();
  // A sample exists only as a file: nobody can save it.
  if (isSampleItem(item) || item.isOwn) return null;
  return (
    <Pressable
      onPress={() => actions.toggleSave(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}: ${saveLabel(item)}`}
      accessibilityState={{ selected: item.saved }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.save,
        indent && styles.saveIndent,
        { backgroundColor: theme.backgroundAlt, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <Text style={[styles.saveText, { color: theme.textGreen }]}>{saveLabel(item)}</Text>
    </Pressable>
  );
}

/** The seal: an entry's own icon on Tanne, the one green an entry carries. */
function Seal({ item, token }: { item: MarketplaceItem; token: string | null }) {
  const card = marketplaceCardProps(item, token);
  return (
    <View style={styles.seal}>
      {card.image ? (
        <Image source={card.image} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <AgentGlyph iconKey={card.iconKey} size={24} color="#FFFFFF" />
      )}
    </View>
  );
}

export function StoryRows({
  items,
  token,
  actions,
  onSelect,
}: { items: readonly MarketplaceItem[] } & ItemProps) {
  const theme = useTheme();
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={[
            styles.row,
            { borderTopColor: theme.cardBorder },
            index === items.length - 1 && {
              borderBottomColor: theme.cardBorder,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Pressable
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint={item.description ?? undefined}
            style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Seal item={item} token={token} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
              {item.description ? (
                <Text style={[styles.small, { color: theme.textSecondary }]} numberOfLines={2}>
                  {`${kindView(item.kind).label}. ${item.description}`}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <SaveButton item={item} actions={actions} indent />
        </View>
      ))}
    </View>
  );
}

function Gallery({
  items,
  token,
  actions,
  onSelect,
}: { items: readonly MarketplaceItem[] } & ItemProps) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.gallery}
      accessibilityLabel="Galerie"
    >
      {items.map((item) => {
        const card = marketplaceCardProps(item, token);
        const cutout = card.imageFit === 'contain';
        return (
          <View key={item.key} style={styles.galleryItem}>
            <Pressable
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              style={({ pressed }) => [
                styles.galleryTile,
                cutout ? styles.galleryCutout : { backgroundColor: theme.backgroundAlt },
                { transform: [{ scale: pressed ? 0.985 : 1 }] },
              ]}
            >
              {card.image ? (
                <Image
                  source={card.image}
                  contentFit={cutout ? 'contain' : 'cover'}
                  style={StyleSheet.absoluteFill}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <AgentGlyph iconKey={card.iconKey} size={36} color={theme.textSecondary} />
              )}
            </Pressable>
            <Text style={[styles.galleryTitle, { color: theme.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <SaveButton item={item} actions={actions} />
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * The themed Grünerator-Vorlagen of the viewer's country, each opening its
 * preview on the Vorlagen screen. Nothing while the catalogue loads or has none.
 */
function VorlagenGallery({
  thema,
  heading,
  token,
}: {
  thema: SharepicThema;
  heading: ReactNode;
  token: string | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useSharepicVorlagen();
  const vorlagen = (data ?? []).filter((v) => v.spec.thema === thema);
  if (vorlagen.length === 0) return null;
  return (
    <View style={styles.block}>
      {heading}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gallery}
        accessibilityLabel="Vorlagen"
      >
        {vorlagen.map((v) => (
          <View key={v.id} style={styles.galleryItem}>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/(focused)/vorlagen', params: { vorlage: v.id } })
              }
              accessibilityRole="button"
              accessibilityLabel={v.titel}
              style={({ pressed }) => [
                styles.galleryTile,
                {
                  width: GALLERY_HEIGHT * vorlageAspectRatio(v),
                  backgroundColor: theme.backgroundAlt,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
              ]}
            >
              {token ? (
                <Image
                  source={vorlageThumbSource(v.id, 1, token, v.thumbVersion)}
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                  accessibilityIgnoresInvertColors
                />
              ) : null}
            </Pressable>
            <Text style={[styles.galleryTitle, { color: theme.text }]} numberOfLines={2}>
              {v.titel}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Friends to pick as profile picture; each opens the Friends settings, where the pick happens. */
function Friends({ ids, heading }: { ids: readonly number[]; heading: ReactNode }) {
  const theme = useTheme();
  const openSettings = useSettingsSheetStore((s) => s.open);
  return (
    <View style={styles.block}>
      {heading}
      <View style={styles.friends}>
        {ids.map((id) => {
          const friend = getFriend(id);
          return (
            <View key={id} style={styles.friend}>
              <Pressable
                onPress={() => openSettings('friend')}
                accessibilityRole="button"
                accessibilityLabel={`${friend.name} als Profilbild wählen`}
                style={({ pressed }) => [
                  styles.friendImage,
                  {
                    backgroundColor: theme.backgroundAlt,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Image
                  source={{ uri: getRobotAvatarUrl(id) }}
                  contentFit="contain"
                  style={StyleSheet.absoluteFill}
                />
              </Pressable>
              <Text style={[styles.galleryTitle, { color: theme.text }]}>{friend.name}</Text>
              <Text style={[styles.small, { color: theme.textSecondary }]}>{friend.tagline}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Block({ block, ...props }: { block: ResolvedStoryBlock } & ItemProps) {
  const theme = useTheme();
  if (block.type === 'text') {
    return (
      <View style={styles.block}>
        {block.paragraphs.map((p) => (
          <Text key={p} style={[styles.paragraph, { color: theme.text }]}>
            {p}
          </Text>
        ))}
      </View>
    );
  }
  if (block.type === 'claim') {
    return (
      <View style={styles.block}>
        <Text style={[styles.claim, { color: theme.text }]}>{block.text}</Text>
        <Text style={[styles.small, { color: theme.textSecondary }]}>
          {block.note}
          {block.source ? (
            <>
              {' Quelle: '}
              <Text
                style={styles.link}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(block.source!.url)}
              >
                {block.source.label}
              </Text>
            </>
          ) : null}
        </Text>
      </View>
    );
  }
  if (block.type === 'quote') {
    return (
      <View style={styles.block}>
        <Text style={[styles.quote, { color: theme.text }]}>{`„${block.text}“`}</Text>
        <Text style={[styles.small, { color: theme.textSecondary }]}>{block.by}</Text>
      </View>
    );
  }
  if (block.type === 'example') {
    return (
      <View style={styles.block}>
        <View style={styles.exchange}>
          <Text style={[styles.small, { color: theme.textSecondary }]}>Du schreibst</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>{block.prompt}</Text>
        </View>
        <View style={styles.exchange}>
          <Text style={[styles.small, { color: theme.textSecondary }]}>
            {`${kindView(block.item.kind).label} antwortet`}
          </Text>
          <Text style={[styles.answer, { color: theme.text }]}>{block.answer}</Text>
        </View>
        <StoryRows items={[block.item]} {...props} />
      </View>
    );
  }
  const heading = block.heading ? (
    <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
      {block.heading}
    </Text>
  ) : null;
  if (block.type === 'vorlagen')
    return <VorlagenGallery thema={block.thema} heading={heading} token={props.token} />;
  if (block.type === 'friends') return <Friends ids={block.ids} heading={heading} />;
  return (
    <View style={styles.block}>
      {heading}
      {block.display === 'rows' ? (
        <StoryRows items={block.items} {...props} />
      ) : (
        <Gallery items={block.items} {...props} />
      )}
    </View>
  );
}

export function CollectionStory({
  blocks,
  ...props
}: { blocks: readonly ResolvedStoryBlock[] } & ItemProps) {
  return (
    <View style={styles.story}>
      {blocks.map((block, index) => (
        // Blocks are a fixed list from the registry; their order is their identity.
        // eslint-disable-next-line react/no-array-index-key
        <Block key={index} block={block} {...props} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  story: { gap: spacing.xxlarge },
  block: { gap: spacing.medium },
  paragraph: { fontFamily: BODY_FONT, fontSize: 18, lineHeight: 28 },
  small: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  link: { textDecorationLine: 'underline' },
  claim: { fontFamily: DISPLAY_FONT, fontSize: 40, lineHeight: 42, letterSpacing: -0.8 },
  quote: { fontFamily: DISPLAY_FONT, fontSize: 24, lineHeight: 30, fontStyle: 'italic' },
  heading: { fontFamily: DISPLAY_FONT, fontSize: 24, lineHeight: 30 },
  answer: { fontFamily: DISPLAY_FONT, fontSize: 22, lineHeight: 28 },
  exchange: { gap: 6 },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.medium,
    gap: spacing.small,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  seal: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.primary[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  save: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    minHeight: 36,
    justifyContent: 'center',
  },
  saveIndent: { marginLeft: 64 },
  saveText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
  gallery: { gap: 20 },
  galleryItem: { gap: 10, maxWidth: 240 },
  galleryTile: {
    height: GALLERY_HEIGHT,
    width: 200,
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryCutout: { width: 165 },
  galleryTitle: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  friends: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.large },
  friend: { width: 150, gap: 10 },
  friendImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
  },
});
