import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  LANDESVERBAND_COVERS,
  MARKETPLACE_CATEGORIES,
  categoryCoverPath,
  landesverbandCardPaths,
  landesverbandHubsOwnFirst,
  marketplaceOriginLabel,
  singleLandesverbandHub,
  type MarketplaceFeature,
  type MarketplaceFilters,
} from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, colors, spacing } from '../../theme';
import { AgentGlyph } from '../agentura/AgentGlyph';
import { SkeletonRows } from '../common/Skeleton';

import { kindView, marketplaceCardProps } from './kindViews';
import { MarketCard } from './MarketCard';
import {
  CollectionCards,
  DISPLAY_FONT,
  ItemShowcaseCard,
  PhotoCard,
  Shelf,
  SwipeRow,
  creditLine,
  showcaseToneAt,
  useRowCardWidth,
  webImage,
} from './showcase';
import { useFrontpageShelves } from './useFrontpageShelves';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * The focus slot's colours — the web's, which are the design rather than a
 * theme token (dark mode keeps the green, dimmed).
 */
const FOCUS = {
  light: {
    bg: colors.primary[600],
    stage: colors.primary[700],
    kicker: colors.primary[100],
    title: colors.white,
    body: colors.primary[50],
    meta: colors.primary[100],
    cta: colors.white,
    ctaText: colors.primary[700],
    ghostBorder: colors.primary[300],
    ghostText: colors.white,
    prompt: colors.white,
    promptText: colors.grey[800],
    answer: colors.primary[50],
    answerText: colors.grey[800],
    answerTitle: colors.primary[600],
  },
  dark: {
    bg: '#14271D',
    stage: '#0F1F17',
    kicker: '#8FC9A9',
    title: '#B5DEC6',
    body: '#C3DCCD',
    meta: '#7CA890',
    cta: '#8FC9A9',
    ctaText: '#0F1F17',
    ghostBorder: '#3E6B52',
    ghostText: '#B5DEC6',
    prompt: colors.grey[800],
    promptText: colors.grey[100],
    answer: '#1C3628',
    answerText: '#DCEEE3',
    answerTitle: '#8FC9A9',
  },
} as const;

export interface MarketplaceFrontpageProps {
  locale: 'de-DE' | 'de-AT';
  lvIds: readonly string[] | null;
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
  /** „Alle anzeigen", a collection or a category: the Marktplatz with that filter. */
  onBrowse: (patch: Partial<MarketplaceFilters>) => void;
  /** A Landesverband's page (`/marktplatz/landesverband/<slug>`). */
  onOpenHub: (slug: string) => void;
}

/**
 * „Start" of the Marktplatz (web: `MarketplaceFrontpage`), in the web's order:
 * one featured item, the collections and themes, then shelves that each hide
 * below their minimum — the server applies the rules from shared
 * (`composeFrontpage`), this file only draws them — and the categories, which
 * replace the kind tabs here as on the web.
 */
export function MarketplaceFrontpage({
  locale,
  lvIds,
  token,
  actions,
  onSelect,
  onBrowse,
  onOpenHub,
}: MarketplaceFrontpageProps) {
  const theme = useTheme();
  const hasLandesverband = (lvIds?.length ?? 0) > 0;
  const view = useFrontpageShelves(hasLandesverband);
  // Exactly one Landesverband: „Alle anzeigen" opens its page instead of the filtered list.
  const lvHub = singleLandesverbandHub(lvIds);
  const rowWidth = useRowCardWidth();

  const card = (item: MarketplaceItem) => (
    <MarketCard
      {...marketplaceCardProps(item, token)}
      onPress={() => onSelect(item)}
      onToggleAdded={() => actions.toggleSave(item)}
    />
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    >
      {view.focusPending ? (
        <SkeletonRows count={2} leading={0} on="card" style={styles.focusSkeleton} />
      ) : view.focus ? (
        <FocusSlot
          item={view.focus}
          feature={view.focusFeature}
          actions={actions}
          onSelect={onSelect}
        />
      ) : null}

      <CollectionCards
        row="rest"
        collections={view.collections}
        onOpen={(collection) => onBrowse({ collection })}
      />
      <CollectionCards
        title="Themen"
        row="themen"
        collections={view.collections}
        onOpen={(collection) => onBrowse({ collection })}
      />

      {view.landesverband.length > 0 ? (
        <Shelf
          title={`Aus deinem Landesverband · ${marketplaceOriginLabel('landesverband', lvIds)}`}
          onMore={() => (lvHub ? onOpenHub(lvHub.slug) : onBrowse({ origin: 'landesverband' }))}
        >
          <View style={styles.stack}>
            {view.landesverband.map((item) => (
              <View key={item.key}>{card(item)}</View>
            ))}
          </View>
        </Shelf>
      ) : null}

      {view.neu.length > 0 ? (
        <Shelf title="Neu im Marktplatz" onMore={() => onBrowse({ sort: 'neu' })}>
          <SwipeRow label="Neu im Marktplatz">
            {view.neu.map((item, index) => (
              <ItemShowcaseCard
                key={item.key}
                item={item}
                tone={showcaseToneAt(index)}
                token={token}
                onPress={() => onSelect(item)}
                width={rowWidth}
              />
            ))}
          </SwipeRow>
        </Shelf>
      ) : null}

      <LandesverbandRow locale={locale} lvIds={lvIds} onOpenHub={onOpenHub} />

      {view.beliebt.length > 0 ? (
        <Shelf title="Beliebt" onMore={() => onBrowse({ sort: 'beliebt' })}>
          <View
            style={[styles.popular, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          >
            {view.beliebt.map((item, index) => (
              <PopularRow
                key={item.key}
                item={item}
                rank={index + 1}
                last={index === view.beliebt.length - 1}
                token={token}
                onPress={() => onSelect(item)}
              />
            ))}
          </View>
        </Shelf>
      ) : null}

      {view.gestalten.length > 0 ? (
        <Shelf
          title="Zum Gestalten"
          moreLabel="Alle Vorlagen"
          onMore={() => onBrowse({ category: 'vorlagen' })}
        >
          <SwipeRow label="Zum Gestalten">
            {view.gestalten.map((item, index) => (
              <ItemShowcaseCard
                key={item.key}
                item={item}
                tone={showcaseToneAt(index)}
                token={token}
                onPress={() => onSelect(item)}
                width={240}
                visual
              />
            ))}
          </SwipeRow>
        </Shelf>
      ) : null}

      <Shelf title="Kategorien" large>
        <View style={styles.stack}>
          {MARKETPLACE_CATEGORIES.map((category) => (
            <PhotoCard
              key={category.id}
              source={webImage(categoryCoverPath(category, 1200))}
              kicker={category.kicker}
              title={category.title}
              description={category.description}
              credit={creditLine(category.cover.credit)}
              aspectRatio={16 / 9}
              onPress={() => onBrowse({ category: category.id })}
            />
          ))}
        </View>
      </Shelf>
    </ScrollView>
  );
}

/**
 * „Landesverbände": one photo card per Landesverband of the viewer's country,
 * their own first. Each opens the Landesverband's page in the Marktplatz.
 */
function LandesverbandRow({
  locale,
  lvIds,
  onOpenHub,
}: {
  locale: 'de-DE' | 'de-AT';
  lvIds: readonly string[] | null;
  onOpenHub: (slug: string) => void;
}) {
  const hubs = landesverbandHubsOwnFirst(locale, lvIds);
  if (hubs.length === 0) return null;
  return (
    <Shelf title="Landesverbände" large>
      <SwipeRow label="Landesverbände">
        {hubs.map(({ hub, own }) => (
          <PhotoCard
            key={hub.lvId}
            source={webImage(landesverbandCardPaths(LANDESVERBAND_COVERS[hub.lvId]).w480)}
            title={hub.title}
            badge={own ? 'Dein Landesverband' : null}
            aspectRatio={3 / 4}
            width={208}
            onPress={() => onOpenHub(hub.slug)}
          />
        ))}
      </SwipeRow>
    </Shelf>
  );
}

function FocusSlot({
  item,
  feature,
  actions,
  onSelect,
}: {
  item: MarketplaceItem;
  /** `null` = the fallback item, which has no pitch or example of its own. */
  feature: MarketplaceFeature | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}) {
  const c = FOCUS[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const props = marketplaceCardProps(item, null);
  const library = kindView(item.kind).toggle === 'library';
  const chat = item.kind === 'agent' || item.kind === 'recipe';
  const example = feature?.example ?? null;
  const saveLabel = library
    ? item.saved
      ? 'In meinen Grüneratoren'
      : 'Zu meinen Grüneratoren'
    : item.saved
      ? 'Gemerkt'
      : 'Merken';

  return (
    <View style={[styles.focus, { backgroundColor: c.bg }]}>
      <View style={styles.focusText}>
        <Text style={[styles.kicker, { color: c.kicker }]}>
          {(feature?.kicker ?? 'Neu im Marktplatz').toUpperCase()}
        </Text>
        <Text
          style={[styles.focusTitle, { color: c.title, fontFamily: DISPLAY_FONT }]}
          accessibilityRole="header"
        >
          {item.title}
        </Text>
        <Text style={[styles.pitch, { color: c.body }]}>{feature?.pitch ?? item.description}</Text>
        <Text style={[styles.focusMeta, { color: c.meta }]}>{props.meta}</Text>
      </View>
      <View style={styles.focusActions}>
        <Pressable
          onPress={() => (chat ? actions.startChat(item) : onSelect(item))}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.focusButton,
            { backgroundColor: c.cta, borderColor: c.cta, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {chat ? (
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={c.ctaText} />
          ) : null}
          <Text style={[styles.focusButtonText, { color: c.ctaText }]}>
            {chat ? 'Im Chat ausprobieren' : 'Ansehen'}
          </Text>
        </Pressable>
        {item.isOwn ? null : (
          <Pressable
            onPress={() => actions.toggleSave(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: item.saved }}
            style={({ pressed }) => [
              styles.focusButton,
              { borderColor: c.ghostBorder, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name={item.saved ? 'checkmark' : 'add'} size={16} color={c.ghostText} />
            <Text style={[styles.focusButtonText, { color: c.ghostText }]}>{saveLabel}</Text>
          </Pressable>
        )}
      </View>
      {example ? (
        <View
          style={[styles.stage, { backgroundColor: c.stage }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.prompt, { backgroundColor: c.prompt, color: c.promptText }]}>
            {example.prompt}
          </Text>
          <View style={[styles.answer, { backgroundColor: c.answer }]}>
            <View style={styles.answerHead}>
              <AgentGlyph iconKey={props.iconKey} size={16} color={c.answerTitle} />
              <Text style={[styles.answerTitle, { color: c.answerTitle }]}>{item.title}</Text>
            </View>
            <Text style={[styles.answerText, { color: c.answerText }]}>{example.answer}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PopularRow({
  item,
  rank,
  last,
  token,
  onPress,
}: {
  item: MarketplaceItem;
  rank: number;
  last: boolean;
  token: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const props = marketplaceCardProps(item, token);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint={`Platz ${rank}, gefällt ${item.likesCount}`}
      style={({ pressed }) => [
        styles.popularRow,
        !last && {
          borderBottomColor: theme.cardBorder,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.rank, { color: theme.textSecondary }]}>{rank}</Text>
      <View style={[styles.popularIcon, { backgroundColor: theme.backgroundAlt }]}>
        <AgentGlyph iconKey={props.iconKey} size={18} color={theme.text} />
      </View>
      <View style={styles.popularText}>
        <Text style={[styles.popularTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.popularMeta, { color: theme.textSecondary }]} numberOfLines={1}>
          {props.meta}
        </Text>
      </View>
      <View style={styles.likes}>
        <Ionicons name="heart-outline" size={14} color={theme.textSecondary} />
        <Text style={[styles.likesText, { color: theme.textSecondary }]}>{item.likesCount}</Text>
      </View>
    </Pressable>
  );
}

const radius = Platform.select({ ios: 16, default: 12 });

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: spacing.xlarge, paddingTop: spacing.small, paddingBottom: spacing.xlarge },
  stack: { gap: spacing.small },
  focusSkeleton: { paddingTop: spacing.small },
  focus: {
    borderRadius: radius + 4,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingTop: spacing.large,
    gap: spacing.medium,
  },
  focusText: { paddingHorizontal: spacing.large, gap: spacing.small },
  kicker: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  focusTitle: { fontSize: 36, lineHeight: 38 },
  pitch: { fontFamily: BODY_FONT, fontSize: 16, lineHeight: 24 },
  focusMeta: { fontFamily: BODY_FONT, fontSize: 14 },
  focusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.large,
    paddingBottom: spacing.large,
  },
  focusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    minHeight: 44,
    paddingHorizontal: spacing.medium,
    borderRadius: 10,
    borderWidth: 1,
  },
  focusButtonText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  stage: { padding: spacing.large, gap: spacing.small },
  prompt: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    overflow: 'hidden',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 21,
  },
  answer: {
    maxWidth: '90%',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.xxsmall,
  },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxsmall },
  answerTitle: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  answerText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 21 },
  popular: {
    borderRadius: radius,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.medium,
  },
  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
  },
  rank: {
    width: 16,
    textAlign: 'right',
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  popularIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularText: { flex: 1, minWidth: 0 },
  popularTitle: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  popularMeta: { fontFamily: BODY_FONT, fontSize: 13 },
  likes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likesText: { fontFamily: BODY_FONT, fontSize: 13, fontVariant: ['tabular-nums'] },
});
