/**
 * Input Screen
 * Form input step for Image Studio
 */

import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { route } from '../../../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { typeRequiresImage, typeHasTextGeneration } from '@gruenerator/shared/image-studio';
import { InputStep } from '../../../../components/image-studio/InputStep';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function InputScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { type, formData, updateField } = useImageStudioStore();

  const handleNext = () => {
    if (!type) return;

    if (typeRequiresImage(type)) {
      router.push(route('/(tabs)/(media)/image-studio/image'));
    } else if (typeHasTextGeneration(type)) {
      router.push(route('/(tabs)/(media)/image-studio/text'));
    } else {
      router.push(route('/(tabs)/(media)/image-studio/result'));
    }
  };

  if (!type) {
    router.replace(route('/(tabs)/(media)/image-studio'));
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <InputStep
        type={type}
        formData={formData}
        onUpdateField={updateField}
        onNext={handleNext}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
