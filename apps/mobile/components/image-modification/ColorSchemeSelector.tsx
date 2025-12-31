import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import {
  COLOR_SCHEME_PRESETS,
  MODIFICATION_LABELS,
  areColorSchemesEqual,
  type DreizeilenColorScheme,
  type ColorSchemePreset,
} from '@gruenerator/shared/image-studio';

interface ColorSchemeSelectorProps {
  colorScheme: DreizeilenColorScheme;
  onColorSchemeChange: (scheme: DreizeilenColorScheme) => void;
  disabled?: boolean;
}

export function ColorSchemeSelector({
  colorScheme,
  onColorSchemeChange,
  disabled = false,
}: ColorSchemeSelectorProps) {
  const systemColorScheme = useColorScheme();
  const theme = systemColorScheme === 'dark' ? darkTheme : lightTheme;

  const getActivePresetId = (): string | null => {
    const match = COLOR_SCHEME_PRESETS.find(preset =>
      areColorSchemesEqual(preset.colors, colorScheme)
    );
    return match?.id || null;
  };

  const activePresetId = getActivePresetId();

  const handlePresetSelect = (preset: ColorSchemePreset) => {
    if (disabled) return;
    onColorSchemeChange([...preset.colors] as DreizeilenColorScheme);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>
        {MODIFICATION_LABELS.COLOR_SCHEME}
      </Text>

      <View style={styles.presetsRow}>
        {COLOR_SCHEME_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <Pressable
              key={preset.id}
              onPress={() => handlePresetSelect(preset)}
              disabled={disabled}
              style={[
                styles.presetButton,
                {
                  borderColor: isActive ? colors.primary[600] : theme.border,
                  borderWidth: isActive ? 2 : 1,
                },
                disabled && styles.disabled,
              ]}
            >
              <View style={styles.colorPreview}>
                {preset.colors.map((color, index) => (
                  <View
                    key={index}
                    style={[
                      styles.colorBar,
                      { backgroundColor: color.background },
                    ]}
                  />
                ))}
              </View>
              {isActive && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary[600]} />
                </View>
              )}
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
    fontSize: 14,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: spacing.small,
  },
  presetButton: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 72,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    position: 'relative',
  },
  colorPreview: {
    flex: 1,
    flexDirection: 'column',
  },
  colorBar: {
    flex: 1,
  },
  checkmark: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.white,
    borderRadius: 10,
  },
  disabled: {
    opacity: 0.5,
  },
});
