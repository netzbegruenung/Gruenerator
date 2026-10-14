import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, borderRadius, spacing, typography } from '../../theme';
import { GRID_MAX_WIDTH, gridColumns } from '../../theme/layout';

import { TILE_GAP } from './StudioAssetSection';

const MIN_TILE = 100;

/** The tile width that fills the screen's grid evenly. */
export function useTileSize(): number {
  const { width } = useWindowDimensions();
  const available = Math.min(width, GRID_MAX_WIDTH) - spacing.medium * 2;
  const columns = gridColumns(available, MIN_TILE, TILE_GAP);
  return Math.floor((available - TILE_GAP * (columns - 1)) / columns);
}

export const SEARCH_PLACEHOLDER = 'Sticker und Hintergründe durchsuchen…';

export function StudioAssetSearchField({
  value,
  onChange,
  placeholder = SEARCH_PLACEHOLDER,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="search" size={18} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder.replace(/…$/, '')}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Suche zurücksetzen"
        >
          <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Nothing to show: a title, a hint and what to do next. */
export function StudioAssetEmpty({
  title,
  hint,
  alert = false,
  children,
}: {
  title: string;
  hint: string;
  alert?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole={alert ? 'alert' : undefined} style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>{hint}</Text>
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, paddingVertical: 0 },
  empty: { alignItems: 'center', gap: spacing.xsmall, paddingTop: spacing.xlarge },
  emptyTitle: { ...typography.bodyBold, textAlign: 'center' },
  emptyHint: { ...typography.body, textAlign: 'center' },
  emptyActions: { width: '100%', maxWidth: 360, gap: spacing.small, marginTop: spacing.small },
});
