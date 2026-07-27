import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

/**
 * One row of a grouped settings card: badge icon, title, and the current value
 * as a subtitle.
 *
 * The value-as-subtitle is the load-bearing part. It is what lets the settings
 * screen be read without tapping anything — "5 verbunden", "Mittel", "System" —
 * which is the whole point of the mobile surface: show state, don't ask the user
 * to go hunting for it.
 *
 * Lifted out of `ComposerActionSheet`, which invented this look and now consumes
 * it from here. Two copies of the same card would have drifted within a release.
 */

/** Card and badge fills. Both surfaces need them, and they must not diverge. */
export function useSurfaceStyles(): {
  card: { backgroundColor: string };
  badge: { backgroundColor: string };
} {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  return {
    card: { backgroundColor: isDark ? theme.surface : colors.white },
    badge: { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
  };
}

interface SettingsRowProps {
  icon: IoniconsIconName;
  title: string;
  /** Current value, shown under the title. */
  value?: string | null;
  onPress?: () => void;
  /**
   * Picker rows show a check instead of the chevron. Leave undefined for
   * navigating rows — `false` still reserves the trailing space so a list of
   * options stays aligned.
   */
  selected?: boolean;
  /** Suppresses the separator on the last row of a card. */
  last?: boolean;
  /** Renders in the error colour — logout, delete account. */
  destructive?: boolean;
  /** Trailing control (a Switch, say). Replaces the chevron. */
  accessory?: ReactNode;
  disabled?: boolean;
}

export function SettingsRow({
  icon,
  title,
  value,
  onPress,
  selected,
  last,
  destructive,
  accessory,
  disabled,
}: SettingsRowProps) {
  const theme = useTheme();
  const { badge } = useSurfaceStyles();
  const tint = destructive ? colors.error[600] : theme.text;

  const trailing = (): ReactNode => {
    if (accessory) return accessory;
    if (selected === undefined) {
      return onPress ? (
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      ) : null;
    }
    return selected ? (
      <Ionicons name="checkmark" size={22} color={colors.primary[600]} />
    ) : (
      <View style={styles.trailingSpacer} />
    );
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.row,
        !last && {
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
    >
      <View style={[styles.badge, badge]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: tint }]} numberOfLines={1}>
          {title}
        </Text>
        {value ? (
          <Text style={[styles.value, { color: theme.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {trailing()}
    </Pressable>
  );
}

/** A rounded card grouping consecutive rows, as in the reference layouts. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const { card } = useSurfaceStyles();
  return <View style={[styles.group, card]}>{children}</View>;
}

const styles = StyleSheet.create({
  group: {
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: 12,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 17,
  },
  value: {
    // Carried over from ComposerActionSheet when these styles moved here (#2104
    // put the row's value on the chat scale; the title it deliberately left raw
    // at 17). Each step carries its own fontFamily, so the row cannot lose it.
    ...chatType.chatSecondary,
    marginTop: 1,
  },
  trailingSpacer: {
    width: 22,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.5,
  },
});
