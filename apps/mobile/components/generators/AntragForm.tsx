import { type Ionicons } from '@expo/vector-icons';
import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  ANTRAG_TYPES,
  validateAntragRequest,
  getFirstError,
  type AntragRequestType,
  type AntragRequest,
} from '@gruenerator/shared/generators';
import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useGeneratorSelectionStore } from '../../stores';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup, MicButton } from '../common';

import { FeatureIcons } from './FeatureIcons';

interface AntragFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

const TYPE_ICONS: Record<AntragRequestType, keyof typeof Ionicons.glyphMap> = {
  antrag: 'list-outline',
  kleine_anfrage: 'help-circle-outline',
  grosse_anfrage: 'megaphone-outline',
};

export function AntragForm({ onResult, onError }: AntragFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [requestType, setRequestType] = useState<AntragRequestType>('antrag');
  const [inhalt, setInhalt] = useState('');
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  const { generate, loading } = useTextGeneration({
    endpoint: GENERATOR_ENDPOINTS.ANTRAG,
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
    const featureState = useGeneratorSelectionStore.getState().getFeatureState();
    const request: Partial<AntragRequest> = {
      requestType,
      inhalt: inhalt.trim(),
      useWebSearchTool: featureState.useWebSearchTool,
      usePrivacyMode: featureState.usePrivacyMode,
      useProMode: featureState.useProMode,
      useUltraMode: featureState.useUltraMode,
      selectedDocumentIds: featureState.selectedDocumentIds,
      selectedTextIds: featureState.selectedTextIds,
    };

    const validation = validateAntragRequest(request);
    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    await generate(request as AntragRequest);
  }, [requestType, inhalt, generate, onError]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: theme.text }]}>Welchen Antrag planst du?</Text>

      <ChipGroup
        options={ANTRAG_TYPES}
        selected={requestType}
        onSelect={(value) => setRequestType(value as AntragRequestType)}
        icons={TYPE_ICONS}
      />

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Thema und Details..."
          value={inhalt}
          onChangeText={setInhalt}
          multiline
          numberOfLines={6}
        />
        <View style={styles.inputToolbar}>
          <FeatureIcons />
          <MicButton
            isListening={isListening}
            onMicPress={() => toggleSpeech((t) => setInhalt((prev) => appendTranscript(prev, t)))}
            hasText={!!inhalt.trim()}
            onSubmit={handleSubmit}
          />
        </View>
      </View>

      <Button onPress={handleSubmit} loading={loading}>
        Grünerieren
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
