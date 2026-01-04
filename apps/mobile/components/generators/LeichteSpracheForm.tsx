import { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, View, useColorScheme } from 'react-native';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button } from '../common';
import { FeatureIcons } from './FeatureIcons';
import { useGeneratorSelectionStore } from '../../stores';
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

    const featureState = useGeneratorSelectionStore.getState().getFeatureState();
    await generate({
      inhalt: originalText.trim(),
      originalText: originalText.trim(),
      useWebSearchTool: featureState.useWebSearchTool,
      usePrivacyMode: featureState.usePrivacyMode,
      useProMode: featureState.useProMode,
      useUltraMode: featureState.useUltraMode,
      selectedDocumentIds: featureState.selectedDocumentIds,
      selectedTextIds: featureState.selectedTextIds,
    });
  }, [originalText, generate, onError]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: theme.text }]}>
          Welchen Text vereinfachen wir?
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            placeholder="Füge hier den Text ein, den du in Leichte Sprache übersetzen möchtest..."
            value={originalText}
            onChangeText={setOriginalText}
            multiline
            numberOfLines={10}
          />
          <View style={styles.featureIconsContainer}>
            <FeatureIcons />
          </View>
        </View>

        <Button onPress={handleSubmit} loading={loading} disabled={!originalText.trim()}>
          In Leichte Sprache übersetzen
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.medium, paddingTop: spacing.xlarge, gap: spacing.medium },
  header: { ...typography.h2, marginBottom: spacing.small },
  inputContainer: {
    position: 'relative',
  },
  featureIconsContainer: {
    position: 'absolute',
    bottom: spacing.medium + 4,
    left: spacing.medium,
  },
});
