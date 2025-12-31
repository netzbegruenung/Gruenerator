import { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup } from '../common';
import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  ANTRAG_TYPES,
  validateAntragRequest,
  getFirstError,
  type AntragRequestType,
  type AntragRequest,
} from '@gruenerator/shared/generators';

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
    const request: Partial<AntragRequest> = {
      requestType,
      inhalt: inhalt.trim(),
    };

    const validation = validateAntragRequest(request);
    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    await generate(request as AntragRequest);
  }, [requestType, inhalt, generate, onError]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: theme.text }]}>
          Welchen Antrag planst du?
        </Text>
        <ChipGroup
          options={ANTRAG_TYPES}
          selected={requestType}
          onSelect={(value) => setRequestType(value as AntragRequestType)}
          icons={TYPE_ICONS}
        />

        <TextInput
          placeholder="Thema und Details..."
          value={inhalt}
          onChangeText={setInhalt}
          multiline
          numberOfLines={6}
        />

        <Button onPress={handleSubmit} loading={loading}>
          Grünerieren
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
