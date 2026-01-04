/**
 * StylingSection Component
 * Renders styling controls (font size, color scheme) based on template type
 */

import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { FontSizeControl, ColorSchemeSelector } from '../../image-modification';
import { spacing, lightTheme, darkTheme } from '../../../theme';
import type { EditSheetConfig } from '../../../config/editSheetConfig';

interface StylingSectionProps {
  config: EditSheetConfig;
  disabled?: boolean;
}

export function StylingSection({
  config,
  disabled = false,
}: StylingSectionProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const showAnyControls = config.showFontSize || config.showColorScheme;

  if (!showAnyControls) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Stil</Text>

      <View style={styles.controlsContainer}>
        {config.showFontSize && (
          <FontSizeControl disabled={disabled} />
        )}

        {config.showColorScheme && (
          <ColorSchemeSelector disabled={disabled} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.medium,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xsmall,
  },
  controlsContainer: {
    gap: spacing.large,
  },
});
