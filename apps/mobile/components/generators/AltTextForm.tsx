import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  GENERATOR_ENDPOINTS,
  validateAltTextRequest,
  getFirstError,
  parseGeneratorResponse,
  parseGeneratorError,
} from '@gruenerator/shared/generators';
import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useGeneratorSelectionStore } from '../../stores';
import { spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ImagePicker, MicButton } from '../common';

import { FeatureIcons } from './FeatureIcons';

interface AltTextFormProps {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

export function AltTextForm({ onResult, onError }: AltTextFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; fileName: string } | null>(
    null
  );
  const [imageDescription, setImageDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  const handleImageSelected = useCallback((base64: string, fileName: string) => {
    setImageBase64(base64);
    setSelectedImage({
      uri: `data:image/jpeg;base64,${base64}`,
      fileName,
    });
  }, []);

  const handleImageClear = useCallback(() => {
    setImageBase64(null);
    setSelectedImage(null);
  }, []);

  const handleImageError = useCallback(
    (error: string) => {
      onError(error);
    },
    [onError]
  );

  const handleSubmit = useCallback(async () => {
    const validation = validateAltTextRequest({
      imageBase64: imageBase64 || '',
    });

    if (!validation.valid) {
      onError(getFirstError(validation) || 'Validierungsfehler');
      return;
    }

    setLoading(true);

    try {
      const featureState = useGeneratorSelectionStore.getState().getFeatureState();
      const client = getGlobalApiClient();
      const response = await client.post(GENERATOR_ENDPOINTS.ALT_TEXT, {
        imageBase64,
        imageDescription: imageDescription.trim() || undefined,
        useWebSearchTool: featureState.useWebSearchTool,
        usePrivacyMode: featureState.usePrivacyMode,
        useProMode: featureState.useProMode,
        useUltraMode: featureState.useUltraMode,
      });

      const parsed = parseGeneratorResponse(response);

      if (parsed.success && parsed.data?.content) {
        onResult(parsed.data.content);
      } else {
        onError(parsed.error || 'Alt-Text konnte nicht grüneriert werden');
      }
    } catch (err) {
      const parsedError = parseGeneratorError(err);
      onError(parsedError.message);
    } finally {
      setLoading(false);
    }
  }, [imageBase64, imageDescription, onResult, onError]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: theme.text }]}>Welches Bild beschreiben wir?</Text>
      <ImagePicker
        onImageSelected={handleImageSelected}
        onError={handleImageError}
        selectedImage={selectedImage}
        onClear={handleImageClear}
      />

      {selectedImage && (
        <View style={styles.descriptionContainer}>
          <View style={styles.inputContainer}>
            <TextInput
              label="Zusätzliche Beschreibung (optional)"
              placeholder="Kontext oder besondere Details zum Bild..."
              value={imageDescription}
              onChangeText={setImageDescription}
              multiline
              numberOfLines={3}
            />
            <View style={styles.inputToolbar}>
              <FeatureIcons showContent={false} />
              <MicButton
                isListening={isListening}
                onMicPress={() =>
                  toggleSpeech((t) => setImageDescription((prev) => appendTranscript(prev, t)))
                }
                hasText={!!imageBase64}
                onSubmit={handleSubmit}
              />
            </View>
          </View>

          <Button onPress={handleSubmit} loading={loading}>
            Alt-Text grünerieren
          </Button>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.medium, paddingTop: spacing.xlarge, gap: spacing.medium },
  header: { ...typography.h2, marginBottom: spacing.small },
  descriptionContainer: { gap: spacing.medium },
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
