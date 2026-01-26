/**
 * VariantSelector Component
 * Style variant chips for pure-create KI generation
 */

import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { KiStyleVariant } from '@gruenerator/shared/image-studio';
import { STYLE_VARIANTS } from '@gruenerator/shared/image-studio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface VariantSelectorProps {
  selected: KiStyleVariant;
  onSelect: (variant: KiStyleVariant) => void;
}

const VARIANT_ICONS: Record<KiStyleVariant, keyof typeof Ionicons.glyphMap> = {
  'illustration-pure': 'brush-outline',
  'realistic-pure': 'camera-outline',
  'pixel-pure': 'grid-outline',
  'editorial-pure': 'newspaper-outline',
};

export function VariantSelector({ selected, onSelect }: VariantSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>Stil wählen</Text>
      <View style={styles.grid}>
        {STYLE_VARIANTS.map((variant) => {
          const isSelected = selected === variant.id;
          return (
            <Pressable
              key={variant.id}
              onPress={() => onSelect(variant.id)}
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
                name={VARIANT_ICONS[variant.id]}
                size={20}
                color={isSelected ? colors.white : theme.textSecondary}
              />
              <View style={styles.chipContent}>
                <Text style={[styles.chipLabel, { color: isSelected ? colors.white : theme.text }]}>
                  {variant.label}
                </Text>
                <Text
                  style={[
                    styles.chipDescription,
                    { color: isSelected ? colors.primary[100] : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {variant.description}
                </Text>
              </View>
              {isSelected && <Ionicons name="checkmark-circle" size={18} color={colors.white} />}
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
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    minWidth: '45%',
    flex: 1,
  },
  chipContent: {
    flex: 1,
  },
  chipLabel: {
    ...typography.label,
    fontSize: 14,
  },
  chipDescription: {
    ...typography.caption,
    fontSize: 11,
  },
});
