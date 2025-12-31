/**
 * Type Selection Screen
 * Entry point for Image Studio - select template or KI type
 */

import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
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
    router.push('./input' as Href);
  };

  const handleKiSelect = (type: ImageStudioKiType) => {
    reset();
    setKiType(type);

    // KI edit types need image upload first, create types go straight to input
    if (kiTypeRequiresImage(type)) {
      router.push('./image' as Href);
    } else {
      router.push('./ki-input' as Href);
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
