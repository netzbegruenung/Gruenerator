import { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, useColorScheme } from 'react-native';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button } from '../common';
import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  validateLeichteSpracheRequest,
  getFirstError,
} from '@gruenerator/shared/generators';

interface LeichteSpracheFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

export function LeichteSpracheForm({ onResult, onError }: LeichteSpracheFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [originalText, setOriginalText] = useState('');

  const { generate, loading } = useTextGeneration({
    endpoint: GENERATOR_ENDPOINTS.LEICHTE_SPRACHE,
    onSuccess: (result) => {
      if (result.data?.content) {
        onResult(result.data.content);
      }
    },
    onError: (error) => {
      onError(error.message);
    },
  });

  const handleSubmit = useCallback(async () => {
    const validation = validateLeichteSpracheRequest({ originalText: originalText.trim() });
    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    await generate({
      inhalt: originalText.trim(),
      originalText: originalText.trim(),
    });
  }, [originalText, generate, onError]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: theme.text }]}>
          Welchen Text vereinfachen wir?
        </Text>
        <TextInput
          placeholder="Füge hier den Text ein, den du in Leichte Sprache übersetzen möchtest..."
          value={originalText}
          onChangeText={setOriginalText}
          multiline
          numberOfLines={10}
        />

        <Button onPress={handleSubmit} loading={loading} disabled={!originalText.trim()}>
          In Leichte Sprache übersetzen
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.medium, gap: spacing.medium },
  header: { ...typography.h2, textAlign: 'center', marginBottom: spacing.small },
});
