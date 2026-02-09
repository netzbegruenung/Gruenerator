/**
 * Type Selection Screen
 * Entry point for Image Studio - select KI type
 */

import { kiTypeRequiresImage } from '@gruenerator/shared/image-studio';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypeSelector } from '../../../../components/image-studio/TypeSelector';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';
import { route } from '../../../../types/routes';

import type { ImageStudioKiType } from '@gruenerator/shared/image-studio';

export default function TypeSelectionScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setKiType, reset } = useImageStudioStore();

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
      <TypeSelector onSelectKi={handleKiSelect} />
    </SafeAreaView>
  );
}
