import { type MarketplaceCollectionId, type MarketplaceItem } from '@gruenerator/contracts';
import {
  MARKETPLACE_QUERY_KEY,
  canReport,
  collectionCoverPath,
  relatedFromCollections,
  useMarketplaceFrontpage,
  useMarketplaceLike,
} from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, spacing } from '../../theme';
import { AgentGlyph } from '../agentura/AgentGlyph';
import { shareLink } from '../agentura/detail/DetailParts';
import { Button } from '../common/Button';
import { ReportSheet, type ReportTarget } from '../common/ReportSheet';

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
 * One Marktplatz item up close (web: `MarketplaceItemDetail`, calm after the
 * App Store's product page): the icon, what it is, then one action row —
 * keep it, beside like, share and report as round buttons — and the ways on
 * (try it, open it) as text below. Then a Vorlage's pages or the picture, the
 * reactions and comments, and „Passt dazu": the collections holding the item,
 * then their other entries, as one row.
 */
export function MarketplaceItemDetail({
  item,
  token,
  actions,
  onBack,
  shareUrl,
  allowReport,
  onSelect,
  onOpenCollection,
}: {
  item: MarketplaceItem;
  token: string | null;
  actions: MarketplaceActions;
  /**
   * In place of a list (the sheet): a link back to it. Left out on the item's
   * own page, where the navigation bar already leads back.
   */
  onBack?: () => void;
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
  const queryClient = useQueryClient();
  const like = useMarketplaceLike();
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const card = marketplaceCardProps(item, token);
  const view = kindView(item.kind);
  const library = view.toggle === 'library';
  const { DetailExtras } = view;
  const large = item.kind === 'template' || item.kind === 'background' || item.kind === 'sticker';
  const ways =
    item.kind === 'agent' || item.kind === 'recipe'
      ? [
          { label: 'Im Chat ausprobieren', run: () => actions.startChat(item) },
          { label: 'Alle Details', run: () => actions.open(item) },
        ]
      : item.kind === 'template'
        ? [{ label: 'Vorlage öffnen', run: () => actions.open(item) }]
        : item.kind === 'notebook'
          ? [{ label: 'Notebook öffnen', run: () => actions.open(item) }]
          : [{ label: 'Im Profilbild verwenden', run: () => actions.toProfilbild(item) }];

  return (
    <ScrollView
      contentContainerStyle={styles.detail}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück: Marktplatz"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={18} color={theme.textGreen} />
          <Text style={[styles.backText, { color: theme.textGreen }]}>Marktplatz</Text>
        </Pressable>
      ) : null}

      {/* Stacked, so a long German compound gets the full width instead of breaking mid-word. */}
      <View style={styles.header}>
        {large ? null : (
          <View style={[styles.icon, { backgroundColor: theme.backgroundAlt }]}>
            <AgentGlyph iconKey={card.iconKey} size={34} color={theme.textGreen} />
          </View>
        )}
        <View style={styles.titles}>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{card.meta}</Text>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {card.title}
          </Text>
        </View>
        {card.description ? (
          <Text style={[styles.body, { color: theme.textSecondary }]}>{card.description}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <View style={styles.actionRow}>
          {card.added !== null ? (
            <Button
              variant={card.added ? 'outline' : 'primary'}
              onPress={() => actions.toggleSave(item)}
              style={styles.save}
            >
              {library
                ? card.added
                  ? 'In meinen Grüneratoren'
                  : 'Zu meinen Grüneratoren'
                : card.added
                  ? 'Gemerkt'
                  : 'Merken'}
            </Button>
          ) : (
            <View style={styles.save} />
          )}
          <RoundButton
            icon={item.liked ? 'heart' : 'heart-outline'}
            label={`Gefällt mir (${item.likesCount})`}
            pressed={item.liked}
            count={item.likesCount}
            onPress={() =>
              like.mutate(item, { onError: (error) => Alert.alert('Fehler', error.message) })
            }
          />
          <RoundButton
            icon={process.env.EXPO_OS === 'ios' ? 'share-outline' : 'share-social-outline'}
            label="Teilen"
            onPress={() => shareLink(shareUrl, item.title)}
          />
          {allowReport && canReport(item) ? (
            <RoundButton
              icon="flag-outline"
              label="Melden"
              onPress={() => setReporting({ kind: item.reportKind, targetId: item.ref })}
            />
          ) : null}
        </View>
        <View style={styles.ways}>
          {ways.map((way) => (
            <Button key={way.label} variant="ghost" onPress={way.run} style={styles.way}>
              {way.label}
            </Button>
          ))}
        </View>
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

      {/* Like, share and report sit in the action row above; this block is the conversation. */}
      <MarketplaceDiscussion
        target={{ kind: item.kind, ref: item.ref }}
        item={null}
        canModerate={item.isOwn}
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

      {allowReport ? (
        <ReportSheet
          target={reporting}
          onClose={() => setReporting(null)}
          // Enough reports hide the item at once; the lists should stop showing it.
          onReported={() => void queryClient.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY })}
        />
      ) : null}
    </ScrollView>
  );
}

function RoundButton({
  icon,
  label,
  pressed,
  count,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  pressed?: boolean;
  count?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={pressed === undefined ? undefined : { selected: pressed }}
      hitSlop={4}
      style={({ pressed: down }) => [
        styles.round,
        { backgroundColor: theme.backgroundAlt, transform: [{ scale: down ? 0.95 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.textGreen} />
      {count !== undefined ? (
        <Text style={[styles.roundCount, { color: theme.textGreen }]}>{count}</Text>
      ) : null}
    </Pressable>
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
  header: { gap: spacing.small },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.04)',
  },
  titles: { gap: 2, marginTop: spacing.xsmall },
  title: { fontFamily: DISPLAY_FONT, fontSize: 26, lineHeight: 30, letterSpacing: -0.4 },
  meta: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  actions: { gap: spacing.xsmall },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  save: { flex: 1 },
  round: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roundCount: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  ways: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  way: { paddingHorizontal: spacing.small },
  body: { fontFamily: BODY_FONT, fontSize: 16, lineHeight: 24, marginTop: spacing.xxsmall },
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
