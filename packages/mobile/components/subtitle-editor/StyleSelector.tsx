/**
 * StyleSelector Component
 * Grid of style options for subtitle appearance
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import {
  SUBTITLE_STYLE_OPTIONS,
  SUBTITLE_STYLE_CONFIGS,
  SUBTITLE_EDITOR_LABELS,
} from '@gruenerator/shared/subtitle-editor';
import type { SubtitleStylePreference } from '@gruenerator/shared/subtitle-editor';

interface StyleSelectorProps {
  value: SubtitleStylePreference;
  onChange: (style: SubtitleStylePreference) => void;
}

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {SUBTITLE_EDITOR_LABELS.styleLabel}
      </Text>
      <View style={styles.grid}>
        {SUBTITLE_STYLE_OPTIONS.map((option) => (
          <StyleOption
            key={option.value}
            option={option}
            isSelected={value === option.value}
            onSelect={() => onChange(option.value)}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

interface StyleOptionProps {
  option: (typeof SUBTITLE_STYLE_OPTIONS)[number];
  isSelected: boolean;
  onSelect: () => void;
  theme: typeof lightTheme | typeof darkTheme;
}

function StyleOption({ option, isSelected, onSelect, theme }: StyleOptionProps) {
  const config = SUBTITLE_STYLE_CONFIGS[option.value];

  return (
    <Pressable
      style={[
        styles.option,
        {
          backgroundColor: theme.card,
          borderColor: isSelected ? colors.primary[600] : theme.cardBorder,
        },
        isSelected && styles.optionSelected,
      ]}
      onPress={onSelect}
    >
      <View style={[styles.preview, { backgroundColor: colors.grey[800] }]}>
        <View
          style={[
            styles.previewText,
            {
              backgroundColor: config.backgroundColor,
              paddingHorizontal: config.padding !== '0' ? 6 : 0,
              paddingVertical: config.padding !== '0' ? 2 : 0,
              borderRadius: config.borderRadius !== '0' ? 2 : 0,
            },
          ]}
        >
          <Text
            style={[
              styles.previewTextContent,
              {
                color: config.textColor,
                textShadowColor: config.textShadow ? 'rgba(0,0,0,0.5)' : 'transparent',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: config.textShadow ? 2 : 0,
              },
            ]}
          >
            Abc
          </Text>
        </View>
      </View>
      <Text style={[styles.optionLabel, { color: theme.text }]}>
        {option.label}
      </Text>
      {option.description === 'Empfohlen' && (
        <View style={styles.recommendedBadge}>
          <Ionicons name="star" size={10} color={colors.primary[600]} />
        </View>
      )}
      {isSelected && (
        <View style={styles.checkmark}>
          <Ionicons name="checkmark-circle" size={18} color={colors.primary[600]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.small,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  option: {
    width: '47%',
    padding: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 2,
    alignItems: 'center',
  },
  optionSelected: {
    borderWidth: 2,
  },
  preview: {
    width: '100%',
    height: 40,
    borderRadius: borderRadius.small,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xsmall,
  },
  previewText: {},
  previewTextContent: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
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
});
