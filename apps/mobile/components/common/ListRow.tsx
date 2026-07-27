import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

/**
 * One row of a grouped card: a leading badge, a title, and the current value as
 * a subtitle.
 *
 * The value-as-subtitle is the load-bearing part. It is what lets a surface be
 * read without tapping anything — "5 verbunden", "Mittel", "3 Mitglieder" —
 * which is the point of these screens: show state, don't make the user go
 * hunting for it.
 *
 * Invented by `ComposerActionSheet`, then wanted by the settings sheet, the
 * Agentura and Projekte. It lives under `common/` rather than `settings/`
 * because four surfaces share it and two copies would have drifted within a
 * release.
 */

/** Card and badge fills. Every surface using these rows needs them, and they
 *  must not diverge. */
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

interface ListRowProps {
  /** Badge icon. Ignored when `leading` is given. */
  icon?: IoniconsIconName;
  /** Replaces the icon badge outright — an avatar or an initials circle. */
  leading?: ReactNode;
  title: string;
  /** Current value or subtitle, shown under the title. */
  value?: string | null;
  /** How many lines the value may take. Agent blurbs need two. */
  valueLines?: number;
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

export function ListRow({
  icon,
  leading,
  title,
  value,
  valueLines = 1,
  onPress,
  selected,
  last,
  destructive,
  accessory,
  disabled,
}: ListRowProps) {
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
      {leading ?? (
        <View style={[styles.badge, badge]}>
          {icon ? <Ionicons name={icon} size={22} color={tint} /> : null}
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.title, { color: tint }]} numberOfLines={1}>
          {title}
        </Text>
        {value ? (
          <Text style={[styles.value, { color: theme.textSecondary }]} numberOfLines={valueLines}>
            {value}
          </Text>
        ) : null}
      </View>
      {trailing()}
    </Pressable>
  );
}

/** A rounded card grouping consecutive rows, as in the reference layouts. */
export function ListGroup({ children }: { children: ReactNode }) {
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
    // #2104 put the row's value on the chat scale and deliberately left the
    // title raw at 17. Each step carries its own fontFamily, so the row cannot
    // lose the font.
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
