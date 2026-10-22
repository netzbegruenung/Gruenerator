import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  collectionCardsFor,
  collectionCoverPath,
  collectionMetaLine,
  plainEmphasis,
  type MarketplaceCollection,
} from '@gruenerator/shared/marketplace';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { WEB_ORIGIN } from '../../services/webOrigin';
import { BODY_FONT, HEADING_FONT_BOLD, HEADING_FONT_SEMIBOLD, colors, spacing } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { AgentGlyph } from '../agentura/AgentGlyph';

import { marketplaceCardProps } from './kindViews';

/**
 * The web Marktplatz's showcase surfaces on mobile (web: `@gruenerator/ui`
 * `ShowcaseCard`, `ShowcasePhotoCard`, `MarketplaceShowcaseCard`): the same
 * three tints, the same cuts, the same order of text. Pictures live on the web
 * origin (`/images/marketplace/**`), so their paths come from shared and get
 * the origin here.
 */

export type ShowcaseTone = MarketplaceCollection['tone'];

/** Headline face of the Marktplatz, the same in both countries (web: Raleway). */
export const DISPLAY_FONT = HEADING_FONT_BOLD;

const TONES: readonly ShowcaseTone[] = ['tanne', 'klee', 'sand'];

/** The tints take turns along a row, as on the collection cards. */
export const showcaseToneAt = (index: number): ShowcaseTone => TONES[index % TONES.length]!;

/** Surface and ghost-icon colour per tint; dark mode keeps one neutral grey. */
export function useTone(tone: ShowcaseTone): { surface: string; ink: string } {
  const dark = useColorScheme() === 'dark';
  if (dark)
    return {
      surface: colors.grey[800],
      ink: tone === 'sand' ? colors.grey[300] : colors.primary[300],
    };
  switch (tone) {
    case 'tanne':
      return { surface: colors.primary[50], ink: colors.primary[600] };
    case 'klee':
      return { surface: colors.primary[100], ink: colors.primary[700] };
    case 'sand':
      return { surface: colors.sand, ink: '#7d6a45' };
  }
}

/** An origin-relative picture path as an image source on the web origin. */
export const webImage = (path: string): ImageSource => ({ uri: `${WEB_ORIGIN}${path}` });

/** The width of one card in a sideways row: the next one peeks in (web: 82 %). */
export function useRowCardWidth(share = 0.82): number {
  const { width } = useWindowDimensions();
  const column = Math.min(width, CONTENT_MAX_WIDTH) - spacing.medium * 2;
  return Math.round(column * share);
}

/** A section of a Marktplatz page: heading, an optional „Alle anzeigen", the body. */
export function Shelf({
  title,
  onMore,
  moreLabel = 'Alle anzeigen',
  large = false,
  children,
}: {
  title: string;
  onMore?: () => void;
  moreLabel?: string;
  /** The page-level headings (Kollektionen, Landesverbände, Kategorien) are a size up. */
  large?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeader}>
        <Text
          style={[styles.shelfTitle, large && styles.shelfTitleLarge, { color: theme.text }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {onMore ? (
          <Pressable
            onPress={onMore}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${moreLabel}: ${title}`}
          >
            <Text style={[styles.more, { color: theme.textGreen }]}>{moreLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A row that scrolls sideways, one card at a time, to the column's edge. */
export function SwipeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      decelerationRate="fast"
      accessibilityLabel={label}
    >
      {children}
    </ScrollView>
  );
}

/**
 * The calm card of the collection rows, „Neu" and the opened pages: a tinted
 * picture area, then meta, title and two lines of description.
 */
export function ShowcaseCard({
  label,
  tone,
  media,
  meta,
  title,
  description,
  onPress,
  compact = false,
  width,
}: {
  label: string;
  tone: ShowcaseTone;
  media: ReactNode;
  meta?: string;
  title: string;
  description?: string | null;
  onPress: () => void;
  /** Lists: a flatter picture area and a smaller title. */
  compact?: boolean;
  width?: number;
}) {
  const theme = useTheme();
  const { surface } = useTone(tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={meta}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        width !== undefined && { width },
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.media, compact && styles.mediaCompact, { backgroundColor: surface }]}>
        {media}
      </View>
      <View style={styles.cardText}>
        {meta ? (
          <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Text
          style={[styles.cardTitle, compact && styles.cardTitleCompact, { color: theme.text }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A picture filling a showcase card's media area. */
export function ShowcaseImage({
  source,
  fit = 'cover',
  onError,
}: {
  source: ImageSource;
  fit?: 'cover' | 'contain';
  onError?: () => void;
}) {
  return (
    <Image
      source={source}
      contentFit={fit}
      onError={onError}
      style={fit === 'contain' ? styles.contain : StyleSheet.absoluteFill}
      transition={150}
      accessibilityIgnoresInvertColors
    />
  );
}

/** An item's own icon, large on the tint (web: the ghost mark). */
export function GhostIcon({
  iconKey,
  tone,
  size = 30,
}: {
  iconKey: string | null;
  tone: ShowcaseTone;
  size?: number;
}) {
  const { ink } = useTone(tone);
  return <AgentGlyph iconKey={iconKey} size={size} color={ink} />;
}

/**
 * An item as a showcase card: Agents, Rezepte and Notebooks show their icon on
 * the tint, Vorlagen, Sticker and Hintergründe their picture.
 */
export function ItemShowcaseCard({
  item,
  tone,
  token,
  onPress,
  width,
  visual = false,
}: {
  item: MarketplaceItem;
  tone: ShowcaseTone;
  token: string | null;
  onPress: () => void;
  width?: number;
  /** „Zum Gestalten": the picture is the point, so the full 16:9 area. */
  visual?: boolean;
}) {
  const card = marketplaceCardProps(item, token);
  // A preview that fails to load: a Vorlage becomes a sheet, anything else its icon (web: `useBrokenPreviews`).
  const [broken, setBroken] = useState(false);
  return (
    <ShowcaseCard
      label={item.title}
      tone={tone}
      media={
        card.image && !broken ? (
          <ShowcaseImage source={card.image} fit={card.imageFit} onError={() => setBroken(true)} />
        ) : item.kind === 'template' ? (
          <Poster title={item.title} />
        ) : (
          <GhostIcon iconKey={card.iconKey} tone={tone} />
        )
      }
      meta={card.meta}
      title={item.title}
      description={item.description}
      onPress={onPress}
      compact={!visual}
      width={width}
    />
  );
}

/** A Vorlage without a preview (a Canva link): a sheet with its title (web: `ShowcaseCardPoster`). */
function Poster({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.poster, { backgroundColor: theme.card }]}>
      <Text style={[styles.posterTitle, { color: theme.text }]} numberOfLines={4}>
        {title}
      </Text>
      <View style={styles.posterBar} />
    </View>
  );
}

/**
 * A photo card with its text on a dark gradient (web: `ShowcasePhotoCard`) —
 * the Landesverbände, the categories.
 */
export function PhotoCard({
  source,
  title,
  kicker,
  description,
  badge,
  credit,
  aspectRatio,
  width,
  onPress,
}: {
  /** A remote picture, or one bundled into the app (`require`). */
  source: ImageSource | number;
  title: string;
  kicker?: string;
  description?: string;
  badge?: string | null;
  /** Unsplash photos name their photographer. */
  credit?: string | null;
  aspectRatio: number;
  width?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[kicker, title, badge].filter(Boolean).join(', ')}
      accessibilityHint={description}
      style={({ pressed }) => [
        styles.photo,
        { aspectRatio, transform: [{ scale: pressed ? 0.98 : 1 }] },
        width !== undefined && { width },
      ]}
    >
      <Image
        source={source}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        transition={150}
        accessibilityIgnoresInvertColors
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.84)']}
        locations={[0.32, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {credit ? (
        <Text style={styles.credit} numberOfLines={1}>
          {credit}
        </Text>
      ) : null}
      <View style={[styles.photoText, description ? styles.photoTextWide : null]}>
        {kicker ? <Text style={styles.photoKicker}>{kicker.toUpperCase()}</Text> : null}
        <Text style={[styles.photoTitle, description ? styles.photoTitleLarge : null]}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.photoDescription} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The photographer line under a photo, as on the web's credit pill. */
export const creditLine = (credit: { author: string } | null | undefined): string | null =>
  credit ? `Foto: ${credit.author} / Unsplash` : null;

/** A collection's cover on its card, or its first entries' icons when it has none. */
function CollectionMedia({
  def,
  items,
}: {
  def: MarketplaceCollection;
  items: readonly MarketplaceItem[];
}) {
  const { ink } = useTone(def.tone);
  if (def.cover) return <ShowcaseImage source={webImage(collectionCoverPath(def.cover, 640))} />;
  return (
    <View style={styles.iconTiles}>
      {items.slice(0, 4).map((item) => (
        <View key={item.key} style={styles.iconTile}>
          <AgentGlyph iconKey={item.iconKey} size={22} color={ink} />
        </View>
      ))}
    </View>
  );
}

/** A row of collections on the front page, swiped sideways (web: `CollectionCards`). */
export function CollectionCards({
  collections,
  onOpen,
  title = 'Kollektionen',
  row,
}: {
  collections: { collectionId: MarketplaceCollectionId; items: MarketplaceItem[] }[];
  onOpen: (id: MarketplaceCollectionId) => void;
  title?: string;
  row?: NonNullable<MarketplaceCollection['row']> | 'rest';
}) {
  const width = useRowCardWidth();
  const cards = collectionCardsFor(collections, row);
  if (cards.length === 0) return null;
  return (
    <Shelf title={title} large>
      <SwipeRow label={title}>
        {cards.map(({ def, items }) => (
          <ShowcaseCard
            key={def.id}
            label={def.title}
            tone={def.tone}
            media={<CollectionMedia def={def} items={items} />}
            meta={collectionMetaLine(def, items.length)}
            title={def.title}
            description={plainEmphasis(def.description)}
            onPress={() => onOpen(def.id)}
            width={width}
          />
        ))}
      </SwipeRow>
    </Shelf>
  );
}

const radius = Platform.select({ ios: 16, default: 12 });

const styles = StyleSheet.create({
  shelf: { gap: spacing.small },
  shelfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  shelfTitle: { flex: 1, fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 17 },
  shelfTitleLarge: { fontSize: 20 },
  more: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '600' },
  row: { gap: spacing.small },
  card: {
    borderRadius: radius,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.small,
    gap: spacing.small,
  },
  cardCompact: { padding: spacing.xsmall, gap: spacing.xsmall },
  media: {
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCompact: { aspectRatio: 5 / 2, borderRadius: 8 },
  contain: { width: '80%', height: '80%' },
  cardText: { gap: 2, paddingHorizontal: spacing.xsmall, paddingBottom: spacing.xsmall },
  meta: { fontFamily: BODY_FONT, fontSize: 13 },
  cardTitle: { fontFamily: DISPLAY_FONT, fontSize: 20, lineHeight: 24 },
  cardTitleCompact: { fontSize: 16, lineHeight: 20 },
  description: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  poster: {
    height: '78%',
    aspectRatio: 3 / 4,
    borderRadius: 6,
    padding: '8%',
    justifyContent: 'space-between',
    boxShadow: '0 6px 18px -8px rgba(0, 0, 0, 0.25)',
  },
  posterTitle: { fontFamily: BODY_FONT, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  posterBar: {
    height: 6,
    width: '33%',
    borderRadius: 3,
    backgroundColor: colors.primary[200],
  },
  iconTiles: { flexDirection: 'row', gap: spacing.small },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    borderRadius: radius,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.grey[800],
  },
  badge: {
    position: 'absolute',
    top: spacing.small,
    left: spacing.small,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary[800],
  },
  credit: {
    position: 'absolute',
    top: spacing.xsmall,
    right: spacing.xsmall,
    maxWidth: '60%',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontFamily: BODY_FONT,
    fontSize: 10.5,
    color: colors.white,
  },
  photoText: {
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
    bottom: spacing.medium,
    gap: 6,
  },
  photoTextWide: { left: spacing.large, right: spacing.large, bottom: spacing.large - 4 },
  photoKicker: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.white,
  },
  photoTitle: { fontFamily: DISPLAY_FONT, fontSize: 20, lineHeight: 23, color: colors.white },
  photoTitleLarge: { fontSize: 28, lineHeight: 30 },
  photoDescription: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
});
