/**
 * Template Input Screen
 * Collects user input, triggers AI text generation, then navigates to canvas editor
 */

import {
  useImageStudio,
  typeRequiresImage,
  type TextGenerationRequest,
} from '@gruenerator/shared/image-studio';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TemplateInputStep } from '../../../components/image-studio/TemplateInputStep';
import { useImageStudioStore } from '../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../theme';
import { route } from '../../../types/routes';

export default function TemplateInputScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    type,
    formData,
    textLoading,
    error,
    updateField,
    setGeneratedText,
    setTextLoading,
    setError,
  } = useImageStudioStore();

  const { generateText } = useImageStudio();

  const handleGenerate = async () => {
    if (!type) return;

    setTextLoading(true);
    setError(null);

    try {
      const result = await generateText(type, formData as unknown as TextGenerationRequest);
      setGeneratedText(result);
      if (typeRequiresImage(type)) {
        router.push(route('/(focused)/image-studio-create/image'));
      } else {
        router.push(route('/(fullscreen)/webview-editor'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Textgenerierung fehlgeschlagen';
      setError(message);
    } finally {
      setTextLoading(false);
    }
  };

  if (!type) {
    router.replace(route('/(tabs)/(media)/image-studio'));
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <TemplateInputStep
        type={type}
        formData={formData}
        textLoading={textLoading}
        error={error}
        onFieldChange={updateField}
        onGenerate={handleGenerate}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
