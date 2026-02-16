/**
 * Type Selection Screen
 * Entry point for Image Studio - select KI type or style variant
 */

import { kiTypeRequiresImage } from '@gruenerator/shared/image-studio';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypeSelector } from '../../../../components/image-studio/TypeSelector';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';
import { route } from '../../../../types/routes';

import type { ImageStudioKiType, KiStyleVariant } from '@gruenerator/shared/image-studio';

export default function TypeSelectionScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setKiType, setKiVariant, reset } = useImageStudioStore();

  const handleVariantSelect = (variant: KiStyleVariant) => {
    reset();
    setKiType('pure-create');
    setKiVariant(variant, true);
    router.push(route('/(focused)/image-studio-create/ki-input'));
  };

  const handleEditSelect = (type: ImageStudioKiType) => {
    reset();
    setKiType(type);

    if (kiTypeRequiresImage(type)) {
      router.push(route('/(focused)/image-studio-create/image'));
    } else {
      router.push(route('/(focused)/image-studio-create/ki-input'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <TypeSelector onSelectVariant={handleVariantSelect} onSelectEdit={handleEditSelect} />
    </SafeAreaView>
  );
}
