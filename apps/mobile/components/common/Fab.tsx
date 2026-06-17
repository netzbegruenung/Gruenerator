import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, spacing } from '../../theme';

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
}: {
  icon: IoniconsIconName;
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
      style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={22} color={color} />
      )}
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
});
