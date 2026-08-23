import { View, StyleSheet, useColorScheme } from 'react-native';

import { lightTheme, darkTheme, spacing } from '../../theme';
import { SkeletonBar, SkeletonCircle, SkeletonGroup, SkeletonLines } from '../common/Skeleton';


import type { EmbeddedSurfaceShape } from '../../services/webview/hostChrome';

/**
 * What the embedded surfaces look like before they have loaded.
 *
 * These three pages draw their own header (see `SELF_CHROMED_PATH_PREFIXES`),
 * so while the WebView is blank the host is showing nothing at all above the
 * status-bar band — a spinner in the middle of an empty screen said only "wait",
 * not "a board is coming". Each drawing below claims the frame its page will
 * fill: the bar across the top, and the body's coarse arrangement.
 *
 * Only the frame, deliberately. None of these skeletons pretends to know how
 * many columns a board has or how long a document is; they draw a plausible
 * amount of the shape and stop, because the point is to hold the layout, not to
 * guess the content.
 */

const CARD_HEIGHTS = [[54, 78, 40], [66, 48], [40, 62, 50]] as const;
const DOC_LINES = ['100%', '92%', '97%', '61%', '100%', '88%'] as const;

/** Back arrow — title — a couple of trailing controls. Every one of them has it. */
function BarRow({ leading, trailing }: { leading: number; trailing: number }) {
  return (
    <View style={styles.bar}>
      <SkeletonCircle size={leading} />
      <SkeletonBar width="42%" height={14} radius={4} style={styles.barTitle} />
      {Array.from({ length: trailing }).map((_, i) => (
        <SkeletonCircle key={i} size={leading} style={styles.barTrailing} />
      ))}
    </View>
  );
}

function BoardBody() {
  return (
    <View style={styles.columns}>
      {CARD_HEIGHTS.map((column, i) => (
        <View key={i} style={styles.column}>
          <SkeletonBar width="70%" height={12} radius={4} />
          {column.map((height, j) => (
            <SkeletonBar key={j} height={height} radius={8} />
          ))}
        </View>
      ))}
    </View>
  );
}

function OfficeBody() {
  return (
    <View style={styles.page}>
      <SkeletonBar width="58%" height={24} radius={6} />
      <SkeletonLines widths={DOC_LINES} gap={10} style={styles.pageLines} />
    </View>
  );
}

/** Menu bar, a stage in the middle, the tool row along the bottom. */
function CanvasBody() {
  return (
    <View style={styles.stageArea}>
      {/* The studio centres a square-ish stage; `aspectRatio` keeps it that way
          on every screen without the skeleton having to measure anything. */}
      <SkeletonBar width="100%" aspectRatio={1} radius={10} />
      <View style={styles.tools}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCircle key={i} size={36} />
        ))}
      </View>
    </View>
  );
}

export function WebViewSkeleton({ shape }: { shape: EmbeddedSurfaceShape }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]} pointerEvents="none">
      <SkeletonGroup style={styles.container}>
        <BarRow leading={shape === 'canvas' ? 20 : 24} trailing={shape === 'office' ? 1 : 2} />
        {shape === 'board' ? <BoardBody /> : shape === 'office' ? <OfficeBody /> : <CanvasBody />}
      </SkeletonGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  barTitle: { flexShrink: 1 },
  barTrailing: { marginLeft: 'auto' },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.small,
    padding: spacing.medium,
  },
  column: { flex: 1, gap: spacing.small },
  page: {
    paddingHorizontal: spacing.large,
    paddingTop: spacing.large,
  },
  pageLines: { marginTop: spacing.medium },
  stageArea: {
    flex: 1,
    padding: spacing.medium,
    gap: spacing.medium,
  },
  tools: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.medium,
  },
});
