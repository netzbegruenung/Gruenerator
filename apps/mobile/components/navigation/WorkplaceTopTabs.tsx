import { useState } from 'react';
import { Pressable, StyleSheet, View, useColorScheme, type LayoutRectangle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, HEADING_FONT_BOLD } from '../../theme';

export const WORKPLACE_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'arbeiten', label: 'Arbeiten' },
] as const;

export type WorkplaceTab = (typeof WORKPLACE_TABS)[number]['id'];

/**
 * The two pills top centre — the mobile port of web's `WorkplaceTabs` on
 * `GlassTabBar`: one frosted capsule with the active pill in white (dark: grey).
 * Both tabs are neutral, unlike web where Arbeiten is tinted green; the colours
 * are web's neutral `PILL_TINT`/`ACTIVE_TEXT`.
 *
 * `progress` is the pager's position (0 = Chat, 1 = Arbeiten, fractions while
 * dragging). The thumb and the label colours follow it on the UI thread, so the
 * pill moves with the finger instead of jumping when the page settles — and no
 * React render runs per frame.
 */
export function WorkplaceTopTabs({
  progress,
  active,
  onSelect,
}: {
  progress: SharedValue<number>;
  active: WorkplaceTab;
  onSelect: (index: number) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  // Measured rather than fixed: the labels differ in width, and the thumb has to
  // cover exactly the pill it sits on.
  const [frames, setFrames] = useState<(LayoutRectangle | null)[]>([null, null]);

  const thumbColor = isDark ? colors.grey[800] : colors.white;
  const activeText = isDark ? colors.grey[100] : colors.grey[900];
  const idleText = isDark ? colors.grey[400] : colors.grey[600];

  const [first, second] = frames;
  const thumbStyle = useAnimatedStyle(() => {
    if (!first || !second) return { opacity: 0 };
    return {
      opacity: 1,
      width: interpolate(progress.get(), [0, 1], [first.width, second.width], 'clamp'),
      transform: [
        { translateX: interpolate(progress.get(), [0, 1], [first.x, second.x], 'clamp') },
      ],
    };
  });

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.capsule,
        isDark
          ? { backgroundColor: 'rgba(23, 23, 23, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }
          : {
              backgroundColor: 'rgba(246, 246, 244, 0.6)',
              borderColor: 'rgba(255, 255, 255, 0.5)',
            },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.thumb, { backgroundColor: thumbColor }, thumbStyle]}
      />
      {WORKPLACE_TABS.map((tab, index) => (
        <Pressable
          key={tab.id}
          onPress={() => onSelect(index)}
          onLayout={(e) => {
            const frame = e.nativeEvent.layout;
            setFrames((prev) => prev.map((f, i) => (i === index ? frame : f)));
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab.id === active }}
          hitSlop={4}
          style={styles.pill}
        >
          <TabLabel
            label={tab.label}
            index={index}
            progress={progress}
            activeColor={activeText}
            idleColor={idleText}
          />
        </Pressable>
      ))}
    </View>
  );
}

function TabLabel({
  label,
  index,
  progress,
  activeColor,
  idleColor,
}: {
  label: string;
  index: number;
  progress: SharedValue<number>;
  activeColor: string;
  idleColor: string;
}) {
  const colorStyle = useAnimatedStyle(() => ({
    // 0 while the thumb sits on this pill, 1 once it is on the other one.
    color: interpolateColor(
      Math.min(Math.abs(progress.get() - index), 1),
      [0, 1],
      [activeColor, idleColor]
    ),
  }));

  return <Animated.Text style={[styles.label, colorStyle]}>{label}</Animated.Text>;
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 3,
    gap: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 999,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 999,
  },
  // One weight for both: a bold active label would change the pill's width the
  // moment the page settles, and the thumb would jump to the new measurement.
  label: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 15,
  },
});
