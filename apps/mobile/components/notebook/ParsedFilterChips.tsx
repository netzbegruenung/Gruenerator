import { type ParsedFilterChip } from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { BODY_FONT, borderRadius, spacing, typography } from '../../theme';
import { getSurfaceFab } from '../../theme/toolTheme';

/** Filters recognised in the typed query, each droppable with one tap — web's
 *  `ParsedFilterChips`. */
export function ParsedFilterChips({
  chips,
  onDrop,
}: {
  chips: readonly ParsedFilterChip[];
  onDrop: (key: string) => void;
}) {
  const tone = getSurfaceFab('wissen', useColorScheme() === 'dark');
  if (chips.length === 0) return null;
  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          onPress={() => onDrop(chip.key)}
          style={[styles.chip, { backgroundColor: tone.background }]}
          accessibilityRole="button"
          accessibilityLabel={`Filter ${chip.label} entfernen`}
          hitSlop={4}
        >
          <Text style={[styles.label, { color: tone.icon }]} numberOfLines={1}>
            {chip.label}
          </Text>
          <Ionicons name="close" size={12} color={tone.icon} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.small,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  label: {
    fontFamily: BODY_FONT,
    ...typography.caption,
    fontWeight: '500',
  },
});
