import { kiTypeRequiresImage } from '@gruenerator/shared/image-studio';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypeSelector } from '../../../components/image-studio/TypeSelector';
import { useImageStudioStore } from '../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../theme';
import { route } from '../../../types/routes';

import type { ImageStudioKiType } from '@gruenerator/shared/image-studio';

export default function KiBildgenerierungScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setKiType, reset } = useImageStudioStore();

  const handleCreateSelect = () => {
    router.push(route('/(focused)/image-studio-create/style'));
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
      <TypeSelector onSelectCreate={handleCreateSelect} onSelectEdit={handleEditSelect} />
    </SafeAreaView>
  );
}
