/**
 * HeightSelector Component
 * Toggle buttons for subtitle vertical position
 */

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import { SUBTITLE_HEIGHT_OPTIONS, SUBTITLE_EDITOR_LABELS } from '@gruenerator/shared/subtitle-editor';
import type { SubtitleHeightPreference } from '@gruenerator/shared/subtitle-editor';

interface HeightSelectorProps {
  value: SubtitleHeightPreference;
  onChange: (height: SubtitleHeightPreference) => void;
}

export function HeightSelector({ value, onChange }: HeightSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {SUBTITLE_EDITOR_LABELS.positionLabel}
      </Text>
      <View style={[styles.buttonGroup, { backgroundColor: theme.surface }]}>
        {SUBTITLE_HEIGHT_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[
              styles.button,
              value === option.value && [
                styles.buttonSelected,
                { backgroundColor: colors.primary[600] },
              ],
            ]}
            onPress={() => onChange(option.value)}
          >
            <Ionicons
              name={option.value === 'tief' ? 'arrow-down' : 'remove'}
              size={16}
              color={value === option.value ? colors.white : theme.text}
            />
            <Text
              style={[
                styles.buttonText,
                { color: value === option.value ? colors.white : theme.text },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
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
  buttonGroup: {
    flexDirection: 'row',
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  buttonSelected: {
    borderRadius: borderRadius.medium,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
