import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import {
  useTextGeneration,
  GENERATOR_ENDPOINTS,
  SOCIAL_PLATFORMS_MOBILE,
  validatePresseSocialRequest,
  getFirstError,
  type SocialPlatform,
  type PresseSocialRequest,
} from '@gruenerator/shared/generators';
import {
  useSharepicGeneration,
  SHAREPIC_TYPES,
  sharepicTypeRequiresAuthor,
  sharepicTypeSupportsImage,
  type SharepicType,
  type SharepicResult,
} from '@gruenerator/shared/sharepic';
import { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, Text, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { useGeneratorSelectionStore } from '../../stores';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup, ImagePicker, MicButton } from '../common';

import { FeatureIcons } from './FeatureIcons';

export interface PresseSocialResult {
  text?: string;
  sharepics?: SharepicResult[];
}

interface PresseSocialFormProps {
  onResult: (result: PresseSocialResult) => void;
  onError: (error: string) => void;
}

const PLATFORM_ICONS: Record<SocialPlatform, keyof typeof Ionicons.glyphMap> = {
  pressemitteilung: 'newspaper-outline',
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  twitter: 'logo-twitter',
  linkedin: 'logo-linkedin',
  sharepic: 'image-outline',
  actionIdeas: 'bulb-outline',
  reelScript: 'videocam-outline',
};

export function PresseSocialForm({ onResult, onError }: PresseSocialFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { showActionSheetWithOptions } = useActionSheet();

  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['instagram']);
  const [inhalt, setInhalt] = useState('');
  const { isListening, toggle: toggleSpeech } = useSpeechToText();
  const [zitatgeber, setZitatgeber] = useState('');

  const [sharepicType, setSharepicType] = useState<SharepicType>('default');
  const [sharepicAuthor, setSharepicAuthor] = useState('');
  const [sharepicImageData, setSharepicImageData] = useState<string | null>(null);

  const showZitatgeber = selectedPlatforms.includes('pressemitteilung');
  const showSharepic = selectedPlatforms.includes('sharepic');
  const showSharepicAuthor = showSharepic && sharepicTypeRequiresAuthor(sharepicType);
  const showSharepicImage = showSharepic && sharepicTypeSupportsImage(sharepicType);

  const currentSharepicTypeLabel =
    SHAREPIC_TYPES.find((t) => t.id === sharepicType)?.shortLabel || 'Standard';

  const { generate, loading: textLoading } = useTextGeneration({
    endpoint: GENERATOR_ENDPOINTS.PRESSE_SOCIAL,
    onError: (error) => {
      onError(error.message);
    },
  });

  const { generateSharepic, loading: sharepicLoading } = useSharepicGeneration({
    onError: (error) => {
      onError(error.message);
    },
  });

  const loading = textLoading || sharepicLoading;

  const handlePlatformSelect = (platforms: SocialPlatform | SocialPlatform[]) => {
    setSelectedPlatforms(Array.isArray(platforms) ? platforms : [platforms]);
  };

  const handleSharepicConfig = useCallback(() => {
    const options = SHAREPIC_TYPES.map((t) => t.label);
    options.push('Abbrechen');

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: options.length - 1,
        title: 'Sharepic-Typ wählen',
      },
      (selectedIndex) => {
        if (selectedIndex !== undefined && selectedIndex < SHAREPIC_TYPES.length) {
          setSharepicType(SHAREPIC_TYPES[selectedIndex].id);
        }
      }
    );
  }, [showActionSheetWithOptions]);

  const handleImageSelected = (base64: string, _fileName: string) => {
    setSharepicImageData(`data:image/jpeg;base64,${base64}`);
  };

  const handleImageClear = () => {
    setSharepicImageData(null);
  };

  const handleSubmit = useCallback(async () => {
    const hasSharepic = selectedPlatforms.includes('sharepic');
    const otherPlatforms = selectedPlatforms.filter((p) => p !== 'sharepic');

    if (!inhalt.trim()) {
      onError('Bitte gib einen Inhalt ein');
      return;
    }

    if (otherPlatforms.length === 0 && !hasSharepic) {
      onError('Bitte wähle mindestens eine Plattform aus');
      return;
    }

    const result: PresseSocialResult = {};
    const promises: Promise<void>[] = [];

    if (hasSharepic) {
      promises.push(
        generateSharepic({
          type: sharepicType,
          thema: inhalt.trim(),
          author: sharepicAuthor.trim() || undefined,
          imageData: sharepicImageData || undefined,
        })
          .then((sharepicResult) => {
            result.sharepics = Array.isArray(sharepicResult) ? sharepicResult : [sharepicResult];
          })
          .catch((err) => {
            console.error('[PresseSocialForm] Sharepic error:', err);
          })
      );
    }

    if (otherPlatforms.length > 0) {
      const featureState = useGeneratorSelectionStore.getState().getFeatureState();
      const request: Partial<PresseSocialRequest> = {
        inhalt: inhalt.trim(),
        platforms: otherPlatforms,
        zitatgeber: showZitatgeber ? zitatgeber.trim() : undefined,
        useWebSearchTool: featureState.useWebSearchTool,
        usePrivacyMode: featureState.usePrivacyMode,
        useProMode: featureState.useProMode,
        useUltraMode: featureState.useUltraMode,
        selectedDocumentIds: featureState.selectedDocumentIds,
        selectedTextIds: featureState.selectedTextIds,
      };

      const validation = validatePresseSocialRequest(request);
      if (!validation.valid) {
        onError(getFirstError(validation) || 'Validierungsfehler');
        return;
      }

      promises.push(
        generate(request as PresseSocialRequest)
          .then((textResult) => {
            if (textResult.data?.content) {
              result.text = textResult.data.content;
            }
          })
          .catch((err) => {
            console.error('[PresseSocialForm] Text generation error:', err);
          })
      );
    }

    await Promise.all(promises);

    if (result.text || result.sharepics) {
      onResult(result);
    }
  }, [
    inhalt,
    selectedPlatforms,
    zitatgeber,
    showZitatgeber,
    generate,
    generateSharepic,
    sharepicType,
    sharepicAuthor,
    sharepicImageData,
    onError,
    onResult,
  ]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: theme.text }]}>Welche Botschaft willst du teilen?</Text>

      <ChipGroup
        options={SOCIAL_PLATFORMS_MOBILE}
        selected={selectedPlatforms}
        onSelect={handlePlatformSelect}
        multiSelect
        icons={PLATFORM_ICONS}
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
          <View style={styles.toolbarRight}>
            <MicButton
              isListening={isListening}
              onMicPress={() => toggleSpeech((t) => setInhalt((prev) => appendTranscript(prev, t)))}
              hasText={!!inhalt.trim()}
              onSubmit={handleSubmit}
            />
            {showSharepic && (
              <Pressable
                onPress={handleSharepicConfig}
                style={[styles.configButton, { borderColor: theme.textSecondary }]}
                hitSlop={8}
              >
                <Ionicons name="image-outline" size={12} color={theme.textSecondary} />
                <Text style={[styles.configButtonText, { color: theme.text }]}>
                  {currentSharepicTypeLabel}
                </Text>
                <Ionicons name="chevron-down" size={12} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {showZitatgeber && (
        <TextInput
          placeholder="Wer soll zitiert werden?"
          value={zitatgeber}
          onChangeText={setZitatgeber}
        />
      )}

      {showSharepicAuthor && (
        <TextInput
          placeholder="Zitatgeber*in für Sharepic"
          value={sharepicAuthor}
          onChangeText={setSharepicAuthor}
        />
      )}

      {showSharepicImage && (
        <View
          style={[
            styles.imagePickerContainer,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <ImagePicker
            onImageSelected={handleImageSelected}
            onError={(error) => console.warn('[PresseSocialForm] Image error:', error)}
            selectedImage={
              sharepicImageData ? { uri: sharepicImageData, fileName: 'Ausgewähltes Bild' } : null
            }
            onClear={handleImageClear}
          />
        </View>
      )}

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
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
  },
  configButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  imagePickerContainer: {
    borderRadius: borderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
