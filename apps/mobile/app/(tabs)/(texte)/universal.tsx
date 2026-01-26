import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, useColorScheme } from 'react-native';
import { useGeneratedTextStore } from '@gruenerator/shared/stores';
import { lightTheme, darkTheme, spacing, colors } from '../../../theme';
import { ContentDisplay } from '../../../components/content';
import { UniversalForm } from '../../../components/generators';

const COMPONENT_NAME = 'universal-mobile';

export default function UniversalScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

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
    setTimeout(() => setError(null), 3000);
  }, []);

  const handleNewGeneration = useCallback(() => {
    clearGeneratedText(COMPONENT_NAME);
    setError(null);
  }, [clearGeneratedText]);

  if (hasResult) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ContentDisplay componentName={COMPONENT_NAME} onNewGeneration={handleNewGeneration} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <UniversalForm onResult={handleResult} onError={handleError} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  error: {
    backgroundColor: colors.semantic.error + '15',
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    marginHorizontal: spacing.medium,
    marginTop: spacing.small,
    borderRadius: 6,
  },
  errorText: { color: colors.semantic.error, fontSize: 13, textAlign: 'center' },
});
