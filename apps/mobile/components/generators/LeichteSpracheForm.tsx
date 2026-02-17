import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  validateLeichteSpracheRequest,
  getFirstError,
} from '@gruenerator/shared/generators';
import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useGeneratorSelectionStore } from '../../stores';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, MicButton } from '../common';

import { FeatureIcons } from './FeatureIcons';

interface LeichteSpracheFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

export function LeichteSpracheForm({ onResult, onError }: LeichteSpracheFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [originalText, setOriginalText] = useState('');
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

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
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: theme.text }]}>Welchen Text vereinfachen wir?</Text>

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Füge hier den Text ein, den du in Leichte Sprache übersetzen möchtest..."
          value={originalText}
          onChangeText={setOriginalText}
          multiline
          numberOfLines={10}
        />
        <View style={styles.inputToolbar}>
          <FeatureIcons />
          <MicButton
            isListening={isListening}
            onMicPress={() =>
              toggleSpeech((t) => setOriginalText((prev) => appendTranscript(prev, t)))
            }
            hasText={!!originalText.trim()}
            onSubmit={handleSubmit}
          />
        </View>
      </View>

      <Button onPress={handleSubmit} loading={loading} disabled={!originalText.trim()}>
        In Leichte Sprache übersetzen
      </Button>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.medium, paddingTop: spacing.xlarge, gap: spacing.medium },
  header: { ...typography.h2, marginBottom: spacing.small },
  inputContainer: {
    position: 'relative',
  },
  inputToolbar: {
    position: 'absolute',
    bottom: spacing.medium + 4,
    left: spacing.medium,
    right: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
