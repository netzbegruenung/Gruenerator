import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  MARKETPLACE_TABS,
  featureFor,
  frontpageView,
  marketplaceOriginLabel,
  type MarketplaceFeature,
  type MarketplaceFilters,
  type MarketplaceTabSlug,
} from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { type ComponentProps, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import gothamUltra from '../../assets/fonts/GothamNarrow-Ultra.ttf';
import grueneType from '../../assets/fonts/GrueneType.ttf';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, HEADING_FONT_SEMIBOLD, colors, spacing } from '../../theme';
import { route } from '../../types/routes';
import { AgentGlyph } from '../agentura/AgentGlyph';
import { Button } from '../common/Button';
import { SkeletonRows } from '../common/Skeleton';

import { kindView, marketplaceCardProps } from './kindViews';
import { MarketCard } from './MarketCard';
import { useFrontpageShelves } from './useFrontpageShelves';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * Headline face of the brand per country, as on the web front page. Loaded at
 * runtime (like `NotebookCoverArt`), so it reaches installed binaries by OTA;
 * until then the bold heading face stands in.
 */
const DISPLAY_FONT = {
  'de-DE': { family: 'GrueneType', asset: grueneType },
  'de-AT': { family: 'GothamNarrow-Ultra', asset: gothamUltra },
} as const;

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

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const KIND_TILES: { slug: MarketplaceTabSlug; hint: string; icon: IoniconName }[] = [
  { slug: 'agents', hint: 'Mit eigener Rolle und eigenem Wissen', icon: 'sparkles-outline' },
  { slug: 'rezepte', hint: 'Fertige Anleitungen für eine Textsorte', icon: 'book-outline' },
  { slug: 'vorlagen', hint: 'Sharepics und Layouts zum Anpassen', icon: 'albums-outline' },
  { slug: 'sticker', hint: 'Freigestellte Motive für deine Bilder', icon: 'happy-outline' },
  { slug: 'hintergruende', hint: 'Flächen und Fotos für Sharepics', icon: 'image-outline' },
];

const tabLabel = (slug: MarketplaceTabSlug) =>
  MARKETPLACE_TABS.find((t) => t.slug === slug)?.label ?? slug;

export interface MarketplaceFrontpageProps {
  locale: 'de-DE' | 'de-AT';
  lvIds: readonly string[] | null;
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
  /** „Alle anzeigen" lands on the list with that filter. */
  onBrowse: (patch: Partial<Pick<MarketplaceFilters, 'tab' | 'origin' | 'sort'>>) => void;
}

/**
 * „Start" of the Marktplatz (web: `MarketplaceFrontpage`): one featured item,
 * then shelves that each hide below their minimum — the rules are
 * `frontpageView` in shared, this file only draws them.
 */
export function MarketplaceFrontpage({
  locale,
  lvIds,
  token,
  actions,
  onSelect,
  onBrowse,
}: MarketplaceFrontpageProps) {
  const theme = useTheme();
  const router = useRouter();
  const hasLandesverband = (lvIds?.length ?? 0) > 0;
  const feature = featureFor(locale);
  const shelves = useFrontpageShelves(feature, hasLandesverband);
  const view = frontpageView({ ...shelves, feature, hasLandesverband });
  const display = DISPLAY_FONT[locale];
  const [fontLoaded] = useFonts({ [display.family]: display.asset });

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
          fontFamily={fontLoaded ? display.family : HEADING_FONT_BOLD}
          actions={actions}
          onSelect={onSelect}
        />
      ) : null}

      {view.landesverband.length > 0 ? (
        <Shelf
          title={`Aus deinem Landesverband · ${marketplaceOriginLabel('landesverband', lvIds)}`}
          onMore={() => onBrowse({ origin: 'landesverband' })}
        >
          {view.landesverband.map((item) => (
            <View key={item.key}>{card(item)}</View>
          ))}
        </Shelf>
      ) : null}

      {view.neu.length > 0 ? (
        <Shelf title="Neu im Marktplatz" onMore={() => onBrowse({ sort: 'neu' })}>
          {view.neu.map((item) => (
            <View key={item.key}>{card(item)}</View>
          ))}
        </Shelf>
      ) : null}

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
          onMore={() => onBrowse({ tab: 'vorlagen' })}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.visualRow}
            accessibilityLabel="Zum Gestalten"
          >
            {view.gestalten.map((item) => (
              <View key={item.key} style={styles.visualTile}>
                {card(item)}
              </View>
            ))}
          </ScrollView>
        </Shelf>
      ) : null}

      <Shelf title="Nach Art stöbern">
        <View style={styles.kindGrid}>
          {KIND_TILES.map((tile) => (
            <Pressable
              key={tile.slug}
              onPress={() => onBrowse({ tab: tile.slug })}
              accessibilityRole="button"
              accessibilityLabel={tabLabel(tile.slug)}
              accessibilityHint={tile.hint}
              style={({ pressed }) => [
                styles.kindTile,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={[styles.kindIcon, { backgroundColor: theme.backgroundAlt }]}>
                <Ionicons name={tile.icon} size={20} color={theme.textGreen} />
              </View>
              <Text style={[styles.kindLabel, { color: theme.text }]}>{tabLabel(tile.slug)}</Text>
              <Text style={[styles.kindHint, { color: theme.textSecondary }]} numberOfLines={2}>
                {tile.hint}
              </Text>
            </Pressable>
          ))}
        </View>
      </Shelf>

      <View style={[styles.join, { backgroundColor: theme.backgroundSand }]}>
        <Text style={[styles.joinTitle, { color: theme.text }]} accessibilityRole="header">
          Du hast ein Rezept, das funktioniert?
        </Text>
        <Text style={[styles.joinBody, { color: theme.textSecondary }]}>
          Teile es öffentlich — dann taucht es hier unter „Neu“ auf, und andere Kreis- und
          Ortsverbände können es mit einem Klick übernehmen.
        </Text>
        <View style={styles.joinActions}>
          <Button onPress={() => router.push('/(focused)/grueneratoren/rezept/neu')}>
            Rezept erstellen
          </Button>
          <Button variant="outline" onPress={() => router.push(route('/(focused)/agents'))}>
            Eigenes teilen
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

function Shelf({
  title,
  onMore,
  moreLabel = 'Alle anzeigen',
  children,
}: {
  title: string;
  onMore?: () => void;
  moreLabel?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeader}>
        <Text style={[styles.shelfTitle, { color: theme.text }]} accessibilityRole="header">
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
      <View style={styles.shelfBody}>{children}</View>
    </View>
  );
}

function FocusSlot({
  item,
  feature,
  fontFamily,
  actions,
  onSelect,
}: {
  item: MarketplaceItem;
  /** `null` = the fallback item, which has no pitch or example of its own. */
  feature: MarketplaceFeature | null;
  fontFamily: string;
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
          style={[styles.focusTitle, { color: c.title, fontFamily }]}
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
  content: { gap: spacing.large, paddingTop: spacing.small, paddingBottom: spacing.xlarge },
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
  shelf: { gap: spacing.small },
  shelfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  shelfTitle: { flex: 1, fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 17 },
  more: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '600' },
  shelfBody: { gap: spacing.small },
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
  visualRow: { gap: spacing.small },
  visualTile: { width: 260 },
  kindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  kindTile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xxsmall,
    padding: spacing.medium,
    borderRadius: radius,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  kindIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxsmall,
  },
  kindLabel: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  kindHint: { fontFamily: BODY_FONT, fontSize: 13, lineHeight: 18 },
  join: {
    borderRadius: radius,
    borderCurve: 'continuous',
    padding: spacing.large,
    gap: spacing.small,
  },
  joinTitle: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 17 },
  joinBody: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 21 },
  joinActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
});
