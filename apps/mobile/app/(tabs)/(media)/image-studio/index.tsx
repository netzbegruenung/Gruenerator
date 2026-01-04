/**
 * Type Selection Screen
 * Entry point for Image Studio - select template or KI type
 */

import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { route } from '../../../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImageStudioTemplateType, ImageStudioKiType } from '@gruenerator/shared/image-studio';
import { kiTypeRequiresImage } from '@gruenerator/shared/image-studio';
import { TypeSelector } from '../../../../components/image-studio/TypeSelector';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function TypeSelectionScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setType, setKiType, reset } = useImageStudioStore();

  const handleTemplateSelect = (type: ImageStudioTemplateType) => {
    reset();
    setType(type);
    router.push(route('/(tabs)/(media)/image-studio/input'));
  };

  const handleKiSelect = (type: ImageStudioKiType) => {
    reset();
    setKiType(type);

    // KI edit types need image upload first, create types go straight to input
    if (kiTypeRequiresImage(type)) {
      router.push(route('/(tabs)/(media)/image-studio/image'));
    } else {
      router.push(route('/(tabs)/(media)/image-studio/ki-input'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <TypeSelector
        onSelectTemplate={handleTemplateSelect}
        onSelectKi={handleKiSelect}
      />
    </SafeAreaView>
  );
}
