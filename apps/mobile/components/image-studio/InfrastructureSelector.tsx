/**
 * InfrastructureSelector Component
 * Multi-select chips for green-edit infrastructure options
 */

import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GreenEditInfrastructure } from '@gruenerator/shared/image-studio';
import { INFRASTRUCTURE_OPTIONS } from '@gruenerator/shared/image-studio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface InfrastructureSelectorProps {
  selected: GreenEditInfrastructure[];
  onToggle: (option: GreenEditInfrastructure) => void;
}

const INFRASTRUCTURE_ICONS: Record<GreenEditInfrastructure, keyof typeof Ionicons.glyphMap> = {
  trees: 'leaf-outline',
  flowers: 'flower-outline',
  'bike-lanes': 'bicycle-outline',
  benches: 'bed-outline',
  sidewalks: 'walk-outline',
  tram: 'train-outline',
  'bus-stop': 'bus-outline',
};

export function InfrastructureSelector({ selected, onToggle }: InfrastructureSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>Elemente hinzufügen (optional)</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Wähle Elemente aus, die zur Straße hinzugefügt werden sollen
      </Text>
      <View style={styles.grid}>
        {INFRASTRUCTURE_OPTIONS.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => onToggle(option.id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isSelected
                    ? colors.primary[600]
                    : isDark
                      ? colors.grey[800]
                      : colors.grey[100],
                  borderColor: isSelected
                    ? colors.primary[600]
                    : isDark
                      ? colors.grey[700]
                      : colors.grey[200],
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <Ionicons
                name={INFRASTRUCTURE_ICONS[option.id]}
                size={18}
                color={isSelected ? colors.white : theme.textSecondary}
              />
              <Text
                style={[styles.chipLabel, { color: isSelected ? colors.white : theme.text }]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {isSelected && <Ionicons name="checkmark" size={16} color={colors.white} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  label: {
    ...typography.label,
  },
  hint: {
    ...typography.caption,
    marginBottom: spacing.xsmall,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipLabel: {
    ...typography.body,
    fontSize: 13,
  },
});
