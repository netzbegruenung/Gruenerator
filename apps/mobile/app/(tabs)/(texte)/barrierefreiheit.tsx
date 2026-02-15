import { Ionicons } from '@expo/vector-icons';
import { ACCESSIBILITY_MODES, type AccessibilityMode } from '@gruenerator/shared/generators';
import { useGeneratedTextStore } from '@gruenerator/shared/stores';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, useColorScheme, BackHandler } from 'react-native';

import { ChipGroup } from '../../../components/common';
import { ContentDisplay } from '../../../components/content';
import { AltTextForm, LeichteSpracheForm } from '../../../components/generators';
import { lightTheme, darkTheme, spacing, colors } from '../../../theme';

const COMPONENT_NAME = 'barrierefreiheit-mobile';

const MODE_ICONS: Record<AccessibilityMode, keyof typeof Ionicons.glyphMap> = {
  'alt-text': 'image-outline',
  'leichte-sprache': 'text-outline',
};

export default function BarrierefreiheitScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [mode, setMode] = useState<AccessibilityMode>('alt-text');
  const [error, setError] = useState<string | null>(null);

  const content = useGeneratedTextStore((state) => state.generatedTexts[COMPONENT_NAME] || '');
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  const hasResult = content.trim().length > 0;

  const handleResult = useCallback(
    (text: string) => {
      setError(null);
      setTextWithHistory(COMPONENT_NAME, text);
    },
    [setTextWithHistory]
  );

  const handleError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleNewGeneration = useCallback(() => {
    clearGeneratedText(COMPONENT_NAME);
    setError(null);
  }, [clearGeneratedText]);

  const handleModeSelect = useCallback((value: AccessibilityMode | AccessibilityMode[]) => {
    const selectedMode = Array.isArray(value) ? value[0] : value;
    if (selectedMode) {
      setMode(selectedMode);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hasResult) {
          handleNewGeneration();
          return true;
        }
        if (mode !== 'alt-text') {
          setMode('alt-text');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [hasResult, mode, handleNewGeneration])
  );

  if (hasResult) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ContentDisplay componentName={COMPONENT_NAME} onNewGeneration={handleNewGeneration} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.modeSelector}>
        <ChipGroup
          options={ACCESSIBILITY_MODES}
          selected={mode}
          onSelect={handleModeSelect}
          icons={MODE_ICONS}
        />
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color={colors.error[500]} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.formContainer}>
        {mode === 'alt-text' ? (
          <AltTextForm onResult={handleResult} onError={handleError} />
        ) : (
          <LeichteSpracheForm onResult={handleResult} onError={handleError} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modeSelector: {
    padding: spacing.medium,
    paddingTop: spacing.xlarge,
    paddingBottom: 0,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginHorizontal: spacing.medium,
    marginTop: spacing.small,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: 8,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
  },
  errorText: {
    flex: 1,
    color: colors.error[500],
    fontSize: 13,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
