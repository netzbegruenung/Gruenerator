import { type Ionicons } from '@expo/vector-icons';
import {
  useTextGeneration,
  UNIVERSAL_TEXT_TYPES,
  GENERATOR_TITLES,
  validateUniversalRequest,
  getFirstError,
  type UniversalTextType,
  type UniversalRequest,
} from '@gruenerator/shared/generators';
import { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useGeneratorSelectionStore } from '../../stores';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup, Slider, MicButton } from '../common';

import { FeatureIcons } from './FeatureIcons';

interface UniversalFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

const TYPE_ICONS: Record<UniversalTextType, keyof typeof Ionicons.glyphMap> = {
  universal: 'create-outline',
  rede: 'mic-outline',
  wahlprogramm: 'clipboard-outline',
  buergeranfragen: 'people-outline',
  leichte_sprache: 'accessibility-outline',
};

export function UniversalForm({ onResult, onError }: UniversalFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [textType, setTextType] = useState<UniversalTextType>('universal');

  // Universal fields
  const [inhalt, setInhalt] = useState('');
  const [textForm, setTextForm] = useState('');

  // Rede fields
  const [rolle, setRolle] = useState('');
  const [thema, setThema] = useState('');
  const [redezeit, setRedezeit] = useState(3);

  // Wahlprogramm fields
  const [zeichenanzahl, setZeichenanzahl] = useState(2000);

  // Bürgeranfragen fields
  const [gremium, setGremium] = useState('');
  const [frage, setFrage] = useState('');
  const [antwort, setAntwort] = useState('');

  // Leichte Sprache fields
  const [originalText, setOriginalText] = useState('');

  const { isListening, toggle: toggleSpeech } = useSpeechToText();
  const micFor = (setter: React.Dispatch<React.SetStateAction<string>>) => () => {
    toggleSpeech((t) => setter((prev) => appendTranscript(prev, t)));
  };

  // Reset type-specific fields when switching
  useEffect(() => {
    setInhalt('');
    setTextForm('');
    setRolle('');
    setThema('');
    setRedezeit(3);
    setZeichenanzahl(2000);
    setGremium('');
    setFrage('');
    setAntwort('');
    setOriginalText('');
  }, [textType]);

  const currentType = UNIVERSAL_TEXT_TYPES.find((t) => t.id === textType)!;
  const title = GENERATOR_TITLES.UNIVERSAL[textType] || 'Was möchtest du heute grünerieren?';

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
    const features = {
      useWebSearchTool: featureState.useWebSearchTool,
      usePrivacyMode: featureState.usePrivacyMode,
      useProMode: featureState.useProMode,
      useUltraMode: featureState.useUltraMode,
      useAutomaticSearch: featureState.useAutomaticSearch,
      selectedDocumentIds: featureState.selectedDocumentIds,
      selectedTextIds: featureState.selectedTextIds,
      attachedFiles: featureState.attachedFiles.map((f) => ({
        name: f.name,
        type: f.type,
        base64: f.base64,
      })),
    };

    switch (textType) {
      case 'rede':
        return {
          ...features,
          textType,
          inhalt: thema.trim(),
          rolle: rolle.trim(),
          thema: thema.trim(),
          redezeit,
        };
      case 'wahlprogramm':
        return {
          ...features,
          textType,
          inhalt: inhalt.trim(),
          zeichenanzahl,
        };
      case 'buergeranfragen':
        return {
          ...features,
          textType,
          inhalt: frage.trim(),
          gremium: gremium.trim(),
          frage: frage.trim(),
          antwort: antwort.trim(),
        };
      case 'leichte_sprache':
        return {
          ...features,
          textType,
          inhalt: originalText.trim(),
          originalText: originalText.trim(),
        };
      default:
        return {
          ...features,
          textType,
          inhalt: inhalt.trim(),
          textForm: textForm.trim() || 'Allgemeiner Text',
        };
    }
  }, [
    textType,
    inhalt,
    textForm,
    rolle,
    thema,
    redezeit,
    zeichenanzahl,
    gremium,
    frage,
    antwort,
    originalText,
  ]);

  const handleSubmit = useCallback(async () => {
    const request = getPayload();

    const validation = validateUniversalRequest(request);
    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    await generate(request as UniversalRequest);
  }, [getPayload, generate, onError]);

  const renderTypeFields = () => {
    switch (textType) {
      case 'rede':
        return (
          <>
            <TextInput
              label="Rolle"
              placeholder="z.B. Sprecher*in der Grünen OV Musterdorf, Antragssteller*in..."
              value={rolle}
              onChangeText={setRolle}
            />
            <View style={styles.inputContainer}>
              <TextInput
                label="Thema"
                placeholder="Beschreibe das Thema, den Anlass und besondere Schwerpunkte der Rede..."
                value={thema}
                onChangeText={setThema}
                multiline
                numberOfLines={5}
              />
              <View style={styles.inputToolbar}>
                <FeatureIcons />
                <MicButton
                  isListening={isListening}
                  onMicPress={micFor(setThema)}
                  hasText={!!thema.trim()}
                  onSubmit={handleSubmit}
                />
              </View>
            </View>
            <Slider
              label="Redezeit (Minuten)"
              value={redezeit}
              min={1}
              max={5}
              step={1}
              onValueChange={setRedezeit}
              valueFormat={(v) => `${v} min`}
            />
          </>
        );

      case 'wahlprogramm':
        return (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                label="Inhalt"
                placeholder="Beschreibe dein Thema und alle relevanten Details..."
                value={inhalt}
                onChangeText={setInhalt}
                multiline
                numberOfLines={6}
              />
              <View style={styles.inputToolbar}>
                <FeatureIcons />
                <MicButton
                  isListening={isListening}
                  onMicPress={micFor(setInhalt)}
                  hasText={!!inhalt.trim()}
                  onSubmit={handleSubmit}
                />
              </View>
            </View>
            <Slider
              label="Zeichenanzahl"
              value={zeichenanzahl}
              min={1000}
              max={3500}
              step={100}
              onValueChange={setZeichenanzahl}
              valueFormat={(v) => `${v}`}
            />
          </>
        );

      case 'buergeranfragen':
        return (
          <>
            <TextInput
              label="Gremium"
              placeholder="z.B. Stadtrat, Kreistag, Ortsvorstand..."
              value={gremium}
              onChangeText={setGremium}
            />
            <View style={styles.inputContainer}>
              <TextInput
                label="Frage"
                placeholder="Beschreibe die Bürger*innenanfrage..."
                value={frage}
                onChangeText={setFrage}
                multiline
                numberOfLines={5}
              />
              <View style={styles.inputToolbar}>
                <FeatureIcons />
                <MicButton
                  isListening={isListening}
                  onMicPress={micFor(setFrage)}
                  hasText={!!frage.trim()}
                  onSubmit={handleSubmit}
                />
              </View>
            </View>
            <TextInput
              label="Antwort"
              placeholder="Beschreibe, wie die Antwort ausfallen soll (z.B. Stil, Tonalität, Kontext)..."
              value={antwort}
              onChangeText={setAntwort}
              multiline
              numberOfLines={4}
            />
          </>
        );

      case 'leichte_sprache':
        return (
          <View style={styles.inputContainer}>
            <TextInput
              placeholder="Gib hier den Text ein, der in Leichte Sprache übersetzt werden soll..."
              value={originalText}
              onChangeText={setOriginalText}
              multiline
              numberOfLines={6}
            />
            <View style={styles.inputToolbar}>
              <FeatureIcons />
              <MicButton
                isListening={isListening}
                onMicPress={micFor(setOriginalText)}
                hasText={!!originalText.trim()}
                onSubmit={handleSubmit}
              />
            </View>
          </View>
        );

      default:
        return (
          <>
            <TextInput
              placeholder="Textform (z.B. Brief, E-Mail, Flyer...)"
              value={textForm}
              onChangeText={setTextForm}
            />
            <View style={styles.inputContainer}>
              <TextInput
                placeholder="Beschreibe was du brauchst..."
                value={inhalt}
                onChangeText={setInhalt}
                multiline
                numberOfLines={6}
              />
              <View style={styles.inputToolbar}>
                <FeatureIcons />
                <MicButton
                  isListening={isListening}
                  onMicPress={micFor(setInhalt)}
                  hasText={!!inhalt.trim()}
                  onSubmit={handleSubmit}
                />
              </View>
            </View>
          </>
        );
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: theme.text }]}>{title}</Text>

      <ChipGroup
        options={UNIVERSAL_TEXT_TYPES}
        selected={textType}
        onSelect={(value) => setTextType(value as UniversalTextType)}
        icons={TYPE_ICONS}
      />

      {renderTypeFields()}

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
