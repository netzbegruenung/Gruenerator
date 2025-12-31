import { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, KeyboardAvoidingView, Platform, View, Pressable, Text, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, lightTheme, darkTheme } from '../../theme';
import { TextInput, Button, ChipGroup } from '../common';
import { SharepicConfigModal } from '../sharepic';
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
  type SharepicType,
  type SharepicResult,
} from '@gruenerator/shared/sharepic';

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

  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['instagram']);
  const [inhalt, setInhalt] = useState('');
  const [zitatgeber, setZitatgeber] = useState('');

  const [showSharepicConfig, setShowSharepicConfig] = useState(false);
  const [sharepicType, setSharepicType] = useState<SharepicType>('default');
  const [sharepicAuthor, setSharepicAuthor] = useState('');
  const [sharepicImageData, setSharepicImageData] = useState<string | null>(null);

  const showZitatgeber = selectedPlatforms.includes('pressemitteilung');
  const showSharepic = selectedPlatforms.includes('sharepic');

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

  const handleImageChange = (base64: string | null, _fileName: string | null) => {
    setSharepicImageData(base64);
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
      const request: Partial<PresseSocialRequest> = {
        inhalt: inhalt.trim(),
        platforms: otherPlatforms,
        zitatgeber: showZitatgeber ? zitatgeber.trim() : undefined,
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: theme.text }]}>
          Welche Botschaft willst du teilen?
        </Text>
        <View style={styles.platformRow}>
          <View style={styles.chipGroupContainer}>
            <ChipGroup
              options={SOCIAL_PLATFORMS_MOBILE}
              selected={selectedPlatforms}
              onSelect={handlePlatformSelect}
              multiSelect
              icons={PLATFORM_ICONS}
            />
          </View>
          {showSharepic && (
            <Pressable
              onPress={() => setShowSharepicConfig(true)}
              style={styles.configButton}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={20} color={colors.primary[600]} />
            </Pressable>
          )}
        </View>

        <TextInput
          placeholder="Thema und Details..."
          value={inhalt}
          onChangeText={setInhalt}
          multiline
          numberOfLines={5}
        />

        {showZitatgeber && (
          <TextInput
            placeholder="Wer soll zitiert werden?"
            value={zitatgeber}
            onChangeText={setZitatgeber}
          />
        )}

        <Button onPress={handleSubmit} loading={loading}>
          Grünerieren
        </Button>
      </ScrollView>

      <SharepicConfigModal
        visible={showSharepicConfig}
        onClose={() => setShowSharepicConfig(false)}
        type={sharepicType}
        onTypeChange={setSharepicType}
        author={sharepicAuthor}
        onAuthorChange={setSharepicAuthor}
        imageData={sharepicImageData}
        onImageChange={handleImageChange}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.medium, gap: spacing.medium },
  header: { ...typography.h2, textAlign: 'center', marginBottom: spacing.small },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
  },
  chipGroupContainer: {
    flex: 1,
  },
  configButton: {
    padding: spacing.small,
    backgroundColor: colors.primary[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
});
