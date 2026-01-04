import { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup } from '../common';
import { FeatureIcons } from './FeatureIcons';
import { useGeneratorSelectionStore } from '../../stores';
import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  TEXT_IMPROVER_ACTIONS,
  validateTextImproverRequest,
  getFirstError,
  type TextImproverAction,
} from '@gruenerator/shared/generators';

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: theme.text }]}>
          Wie soll dein Text besser werden?
        </Text>
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
          <View style={styles.featureIconsContainer}>
            <FeatureIcons />
          </View>
        </View>

        <Button onPress={handleSubmit} loading={loading} disabled={!originalText.trim()}>
          Text bearbeiten
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
