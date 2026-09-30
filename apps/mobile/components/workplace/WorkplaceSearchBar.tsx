import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, TextInput, View, useColorScheme } from 'react-native';

import { borderRadius, darkTheme, lightTheme, spacing, BODY_FONT } from '../../theme';

import type { ReactElement } from 'react';

/**
 * The search field Arbeiten unfolds in place of its "Zuletzt" heading. Focused
 * on mount, since opening it is the request to type; the cross closes the
 * search, not just the text.
 */
export function WorkplaceSearchBar({
  value,
  onChange,
  onClose,
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  /** Kept at the right end, like the heading's controls (the grid/list switch). */
  trailing?: ReactElement;
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Arbeiten durchsuchen…"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Arbeiten durchsuchen"
          style={[styles.input, { color: theme.text }]}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Suche schließen"
        >
          <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    height: 40,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 15,
    paddingVertical: 0,
  },
});
