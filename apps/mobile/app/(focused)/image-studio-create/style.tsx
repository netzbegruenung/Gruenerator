import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StyleSelector } from '../../../components/image-studio/StyleSelector';
import { useImageStudioStore } from '../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../theme';
import { route } from '../../../types/routes';

import type { KiStyleVariant } from '@gruenerator/shared/image-studio';

export default function StyleScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { setKiType, setKiVariant, reset } = useImageStudioStore();

  const handleSelectVariant = (variant: KiStyleVariant) => {
    reset();
    setKiType('pure-create');
    setKiVariant(variant, true);
    router.push(route('/(focused)/image-studio-create/ki-input'));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StyleSelector onSelectVariant={handleSelectVariant} />
    </SafeAreaView>
  );
}
