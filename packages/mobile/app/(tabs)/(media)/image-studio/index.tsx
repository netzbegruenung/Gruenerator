/**
 * Type Selection Screen
 * Entry point for Image Studio - select template type
 */

import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImageStudioTemplateType } from '@gruenerator/shared/image-studio';
import { TypeSelector } from '../../../../components/image-studio/TypeSelector';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function TypeSelectionScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setType, reset } = useImageStudioStore();

  const handleTypeSelect = (type: ImageStudioTemplateType) => {
    reset();
    setType(type);
    router.push('./input' as Href);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <TypeSelector onSelect={handleTypeSelect} />
    </SafeAreaView>
  );
}
