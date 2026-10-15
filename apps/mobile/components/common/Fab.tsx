import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, HEADING_FONT_SEMIBOLD } from '../../theme';

import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Shared floating action button — the bottom-right circular FAB used across the
 * app (recherche, docs, notebook). Consolidates the `fab` style that was
 * copy-pasted per screen. Pass `style` to nudge position (e.g. raise above a
 * composer) or override the background. Pass `loading` to show a spinner in
 * place of the icon while an action runs (e.g. docs "create document").
 */
export function Fab({
  icon,
  onPress,
  accessibilityLabel,
  color = colors.white,
  loading = false,
  disabled = false,
  style,
  label,
}: {
  icon: IoniconsIconName;
  /** Makes it an extended FAB: icon and text, for an action that must not be missed. */
  label?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
        label ? styles.extended : null,
        { opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={22} color={color} />
      )}
      {label ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.medium,
    bottom: spacing.medium,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
  },
  extended: {
    width: 'auto',
    flexDirection: 'row',
    gap: spacing.xsmall,
    paddingLeft: spacing.medium,
    paddingRight: spacing.large,
  },
  label: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 16 },
});
