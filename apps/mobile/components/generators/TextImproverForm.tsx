import { type Ionicons } from '@expo/vector-icons';
import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  TEXT_IMPROVER_ACTIONS,
  validateTextImproverRequest,
  getFirstError,
  type TextImproverAction,
} from '@gruenerator/shared/generators';
import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useGeneratorSelectionStore } from '../../stores';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup, MicButton } from '../common';

import { FeatureIcons } from './FeatureIcons';

interface TextImproverFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

const ACTION_ICONS: Record<TextImproverAction, keyof typeof Ionicons.glyphMap> = {
  improve: 'sparkles-outline',
  rewrite: 'refresh-outline',
  summarize: 'contract-outline',
  spellcheck: 'checkmark-circle-outline',
  formalize: 'briefcase-outline',
  simplify: 'text-outline',
};

export function TextImproverForm({ onResult, onError }: TextImproverFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [action, setAction] = useState<TextImproverAction>('improve');
  const [originalText, setOriginalText] = useState('');
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  const { generate, loading } = useTextGeneration({
    endpoint: GENERATOR_ENDPOINTS.TEXT_IMPROVER,
    onSuccess: (result) => {
      if (result.data?.content) {
        onResult(result.data.content);
      }
    },
    onError: (error) => {
      onError(error.message);
    },
  });

  const handleActionSelect = useCallback((value: TextImproverAction | TextImproverAction[]) => {
    const selectedAction = Array.isArray(value) ? value[0] : value;
    if (selectedAction) {
      setAction(selectedAction);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const validation = validateTextImproverRequest({
      originalText: originalText.trim(),
      action,
    });

    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    const featureState = useGeneratorSelectionStore.getState().getFeatureState();
    await generate({
      inhalt: originalText.trim(),
      originalText: originalText.trim(),
      action,
      useWebSearchTool: featureState.useWebSearchTool,
      usePrivacyMode: featureState.usePrivacyMode,
      useProMode: featureState.useProMode,
      useUltraMode: featureState.useUltraMode,
      selectedDocumentIds: featureState.selectedDocumentIds,
      selectedTextIds: featureState.selectedTextIds,
    });
  }, [originalText, action, generate, onError]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: theme.text }]}>Wie soll dein Text besser werden?</Text>
      <ChipGroup
        options={TEXT_IMPROVER_ACTIONS}
        selected={action}
        onSelect={handleActionSelect}
        icons={ACTION_ICONS}
      />

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Füge hier den Text ein, den du bearbeiten möchtest..."
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
        Text bearbeiten
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
