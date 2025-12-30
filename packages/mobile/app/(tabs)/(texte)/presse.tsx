import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, useColorScheme } from 'react-native';
import { useGeneratedTextStore } from '@gruenerator/shared/stores';
import type { SharepicResult } from '@gruenerator/shared/sharepic';
import { lightTheme, darkTheme, spacing, colors } from '../../../theme';
import { ContentDisplay } from '../../../components/content';
import { PresseSocialForm, type PresseSocialResult } from '../../../components/generators';
import { SharepicResult as SharepicResultComponent } from '../../../components/sharepic';

const COMPONENT_NAME = 'presse-social-mobile';

export default function PresseScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [error, setError] = useState<string | null>(null);
  const [sharepics, setSharepics] = useState<SharepicResult[] | null>(null);

  const content = useGeneratedTextStore((state) => state.generatedTexts[COMPONENT_NAME] || '');
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  const hasTextResult = content.trim().length > 0;
  const hasSharepicResult = sharepics && sharepics.length > 0;
  const hasResult = hasTextResult || hasSharepicResult;

  const handleResult = useCallback((result: PresseSocialResult) => {
    setError(null);

    if (result.text) {
      setTextWithHistory(COMPONENT_NAME, result.text);
    }

    if (result.sharepics && result.sharepics.length > 0) {
      setSharepics(result.sharepics);
    }
  }, [setTextWithHistory]);

  const handleError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3000);
  }, []);

  const handleNewGeneration = useCallback(() => {
    clearGeneratedText(COMPONENT_NAME);
    setSharepics(null);
    setError(null);
  }, [clearGeneratedText]);

  if (hasResult) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        {hasSharepicResult && (
          <SharepicResultComponent
            sharepics={sharepics!}
            onNewGeneration={!hasTextResult ? handleNewGeneration : undefined}
          />
        )}

        {hasTextResult && (
          <ContentDisplay
            componentName={COMPONENT_NAME}
            onNewGeneration={handleNewGeneration}
          />
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <PresseSocialForm onResult={handleResult} onError={handleError} />
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
