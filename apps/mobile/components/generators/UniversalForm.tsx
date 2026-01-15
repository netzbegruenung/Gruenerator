import { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup } from '../common';
import { FeatureIcons } from './FeatureIcons';
import { useGeneratorSelectionStore } from '../../stores';
import {
  useTextGeneration,
  UNIVERSAL_TEXT_TYPES,
  validateUniversalRequest,
  getFirstError,
  type UniversalTextType,
  type UniversalRequest,
} from '@gruenerator/shared/generators';

interface UniversalFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

const TYPE_ICONS: Record<UniversalTextType, keyof typeof Ionicons.glyphMap> = {
  universal: 'create-outline',
  rede: 'mic-outline',
  wahlprogramm: 'clipboard-outline',
  buergeranfragen: 'people-outline',
};

export function UniversalForm({ onResult, onError }: UniversalFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [textType, setTextType] = useState<UniversalTextType>('universal');
  const [inhalt, setInhalt] = useState('');
  const [textForm, setTextForm] = useState('');

  const currentType = UNIVERSAL_TEXT_TYPES.find((t) => t.id === textType)!;

  const { generate, loading } = useTextGeneration({
    endpoint: currentType.endpoint,
    onSuccess: (result) => {
      if (result.data?.content) {
        onResult(result.data.content);
      }
    },
    onError: (error) => {
      onError(error.message);
    },
  });

  const getPayload = useCallback((): Partial<UniversalRequest> => {
    const featureState = useGeneratorSelectionStore.getState().getFeatureState();
    const base = {
      textType,
      inhalt: inhalt.trim(),
      useWebSearchTool: featureState.useWebSearchTool,
      usePrivacyMode: featureState.usePrivacyMode,
      useProMode: featureState.useProMode,
      useUltraMode: featureState.useUltraMode,
      useAutomaticSearch: featureState.useAutomaticSearch,
      selectedDocumentIds: featureState.selectedDocumentIds,
      selectedTextIds: featureState.selectedTextIds,
      attachedFiles: featureState.attachedFiles.map(f => ({
        name: f.name,
        type: f.type,
        base64: f.base64,
      })),
    };

    switch (textType) {
      case 'rede':
        return {
          ...base,
          rolle: 'Sprecher*in',
          thema: inhalt.trim(),
          zielgruppe: 'Bürger*innen',
          redezeit: 3,
        };
      case 'wahlprogramm':
        return { ...base, zeichenanzahl: 2000 };
      case 'buergeranfragen':
        return {
          ...base,
          gremium: 'Stadtrat',
          frage: inhalt.trim(),
          antwort: 'bürgerfreundlich',
        };
      default:
        return {
          ...base,
          textForm: textForm.trim() || 'Allgemeiner Text',
        };
    }
  }, [textType, inhalt, textForm]);

  const handleSubmit = useCallback(async () => {
    const request = getPayload();

    const validation = validateUniversalRequest(request);
    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    await generate(request as UniversalRequest);
  }, [getPayload, generate, onError]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: theme.text }]}>
          Was möchtest du heute grünerieren?
        </Text>

        <ChipGroup
          options={UNIVERSAL_TEXT_TYPES}
          selected={textType}
          onSelect={(value) => setTextType(value as UniversalTextType)}
          icons={TYPE_ICONS}
        />

        {textType === 'universal' && (
          <TextInput
            placeholder="Textform (z.B. Brief, E-Mail, Flyer...)"
            value={textForm}
            onChangeText={setTextForm}
          />
        )}

        <View style={styles.inputContainer}>
          <TextInput
            placeholder="Beschreibe was du brauchst..."
            value={inhalt}
            onChangeText={setInhalt}
            multiline
            numberOfLines={6}
          />
          <View style={styles.featureIconsContainer}>
            <FeatureIcons />
          </View>
        </View>

        <Button onPress={handleSubmit} loading={loading}>
          Grünerieren
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
