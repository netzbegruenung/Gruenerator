/**
 * OptionGrid Component
 * Generic grid selector for choosing from predefined options
 */

import { type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

export interface OptionItem<T = string> {
  id: T;
  label: string;
  description?: string;
  recommended?: boolean;
  renderPreview?: () => ReactNode;
}

export interface OptionGridProps<T = string> {
  options: OptionItem<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
  disabled?: boolean;
  showCheckmark?: boolean;
  compact?: boolean;
}

export function OptionGrid<T extends string = string>({
  options,
  value,
  onChange,
  columns = 4,
  disabled = false,
  showCheckmark = true,
  compact = false,
}: OptionGridProps<T>) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const getItemWidth = () => {
    switch (columns) {
      case 2:
        return '47%';
      case 3:
        return '31%';
      case 4:
        return '23%';
      default:
        return '23%';
    }
  };

  return (
    <View style={styles.grid}>
      {options.map((option) => {
        const isSelected = value === option.id;

        return (
          <Pressable
            key={option.id}
            style={[
              styles.option,
              compact ? styles.optionCompact : styles.optionRegular,
              {
                width: getItemWidth(),
                backgroundColor: theme.card,
                borderColor: isSelected ? colors.primary[600] : theme.cardBorder,
                borderWidth: isSelected ? 2 : 1,
              },
              disabled && styles.disabled,
            ]}
            onPress={() => onChange(option.id)}
            disabled={disabled}
          >
            {option.renderPreview && (
              <View style={[styles.preview, compact && styles.previewCompact]}>
                {option.renderPreview()}
              </View>
            )}

            <Text
              style={[
                styles.optionLabel,
                compact && styles.optionLabelCompact,
                { color: theme.text },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>

            {option.description && !compact && (
              <Text
                style={[styles.optionDescription, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {option.description}
              </Text>
            )}

            {option.recommended && (
              <View style={styles.recommendedBadge}>
                <Ionicons name="star" size={10} color={colors.primary[600]} />
              </View>
            )}

            {showCheckmark && isSelected && (
              <View style={styles.checkmark}>
                <Ionicons
                  name="checkmark-circle"
                  size={compact ? 14 : 18}
                  color={colors.primary[600]}
                />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  option: {
    borderRadius: borderRadius.small,
    alignItems: 'center',
    position: 'relative',
  },
  optionRegular: {
    padding: spacing.small,
  },
  optionCompact: {
    padding: spacing.xsmall,
  },
  preview: {
    width: '100%',
    height: 40,
    borderRadius: borderRadius.small,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xsmall,
    backgroundColor: colors.grey[800],
    overflow: 'hidden',
  },
  previewCompact: {
    height: 32,
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  optionLabelCompact: {
    fontSize: 11,
  },
  optionDescription: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  recommendedBadge: {
    position: 'absolute',
    top: spacing.xsmall,
    left: spacing.xsmall,
  },
  checkmark: {
    position: 'absolute',
    top: spacing.xsmall,
    right: spacing.xsmall,
  },
  disabled: {
    opacity: 0.5,
  },
});
