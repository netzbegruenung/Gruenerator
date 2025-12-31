import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

export interface ChipOption {
  id: string;
  label: string;
  shortLabel?: string;
}

interface ChipGroupProps<T extends string> {
  options: readonly ChipOption[];
  selected: T | T[];
  onSelect: (value: T | T[]) => void;
  multiSelect?: boolean;
  icons?: Record<string, keyof typeof Ionicons.glyphMap>;
}

export function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
  multiSelect = false,
  icons,
}: ChipGroupProps<T>) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const isSelected = (id: string): boolean => {
    if (multiSelect) {
      return Array.isArray(selected) && selected.includes(id as T);
    }
    return selected === id;
  };

  const handlePress = (id: T) => {
    if (multiSelect) {
      const currentSelected = Array.isArray(selected) ? selected : [];
      if (currentSelected.includes(id)) {
        onSelect(currentSelected.filter((s) => s !== id) as T[]);
      } else {
        onSelect([...currentSelected, id] as T[]);
      }
    } else {
      onSelect(id);
    }
  };

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const active = isSelected(option.id);
        const icon = icons?.[option.id];
        return (
          <Pressable
            key={option.id}
            onPress={() => handlePress(option.id as T)}
            style={[
              styles.chip,
              {
                borderColor: active ? colors.primary[600] : theme.border,
                backgroundColor: active ? colors.primary[600] : 'transparent',
              },
            ]}
          >
            {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : theme.text} />}
            <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
