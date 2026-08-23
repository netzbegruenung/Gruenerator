import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';


import { useLayout } from '../../hooks/useLayout';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  BODY_FONT,
} from '../../theme';
import { gridColumns } from '../../theme/layout';
import { SkeletonBar, SkeletonCircle, SkeletonGroup } from '../common/Skeleton';

/**
 * The notebook gallery card. One component for both system and user notebooks —
 * the optional `meta`/`subtitle` second line is what distinguishes them (system:
 * "542 Artikel"; user: "12 Dokumente · …"). Do not fork into two cards.
 */
export function NotebookCard({
  icon,
  title,
  meta,
  subtitle,
  onPress,
  onLongPress,
  isProcessing,
  trailing,
  style,
}: {
  icon: IoniconsIconName;
  title: string;
  meta?: string;
  subtitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
  isProcessing?: boolean;
  /** Replaces the default chevron (e.g. a like button). A nested Pressable here
   *  captures the touch, so tapping it won't also fire the card's onPress. */
  trailing?: ReactNode;
  /** Extra root style — e.g. a width for laying cards out in a tablet grid. */
  style?: StyleProp<ViewStyle>;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const secondaryLine = subtitle ?? meta;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        style,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={colors.primary[600]} />
      <View style={styles.textColumn}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {secondaryLine ? (
          <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
            {secondaryLine}
          </Text>
        ) : null}
      </View>
      {isProcessing ? (
        <ActivityIndicator size="small" color={colors.primary[600]} />
      ) : (
        (trailing ?? <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />)
      )}
    </Pressable>
  );
}

/**
 * A stack of cards in outline, for a shelf that is still loading. It lives here
 * rather than at the call sites so it keeps sharing `styles.card` — the border,
 * the radius and the padding stay in step with the real card by construction.
 */
export function NotebookCardSkeleton({
  count = 4,
  itemStyle,
}: {
  count?: number;
  /** The grid width from `useNotebookGrid().item`, where there is a grid. */
  itemStyle?: StyleProp<ViewStyle>;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const titleWidths = ['64%', '48%', '73%', '55%'] as const;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.card,
            itemStyle,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <SkeletonGroup on="card" style={skeletonCardStyles.row}>
            <SkeletonCircle size={18} />
            <View style={skeletonCardStyles.text}>
              <SkeletonBar width={titleWidths[i % titleWidths.length]} height={14} />
              <SkeletonBar width="34%" height={11} />
            </View>
          </SkeletonGroup>
        </View>
      ))}
    </>
  );
}

const skeletonCardStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall, flex: 1 },
  text: { flex: 1, gap: 3 },
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.xsmall,
    marginBottom: spacing.xxsmall,
  },
  textColumn: {
    flex: 1,
  },
  cardTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
  },
  cardMeta: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    marginTop: 1,
  },
});

const GRID_GAP = spacing.xsmall;

/**
 * Smallest a notebook card may get before a column is dropped. Wider than a
 * square tile: this card is a row — icon, title, subtitle and a trailing
 * control on one line.
 */
const MIN_CARD = 300;

const notebookGridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
});

/**
 * Shared layout for rendering NotebookCards side by side once there is room for
 * it. Spread `container` on the wrapper and `item` on each card.
 *
 * Both are undefined on a phone, where the cards stay a full-width stack — that
 * is a list, and a list of one column is what it should be. `'48%'` used to
 * stand in for the tablet width, which could not account for the gap and fixed
 * the count at two however wide the window got.
 */
export function useNotebookGrid(): { container?: ViewStyle; item?: ViewStyle } {
  const { isTablet, gridWidth } = useLayout();

  return useMemo(() => {
    if (!isTablet) return {};
    const columns = gridColumns(gridWidth, MIN_CARD, GRID_GAP);
    return {
      container: notebookGridStyles.grid,
      item: { width: Math.floor((gridWidth - GRID_GAP * (columns - 1)) / columns) },
    };
  }, [isTablet, gridWidth]);
}
