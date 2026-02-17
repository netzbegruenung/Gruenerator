import { router } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImageUploadStep } from '../../../components/image-studio/ImageUploadStep';
import { useImageStudioStore } from '../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../theme';
import { route } from '../../../types/routes';

export default function ImageScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { kiType, uploadedImageUri, setUploadedImage, clearUploadedImage } = useImageStudioStore();

  const handleNext = () => {
    router.push(route('/(focused)/image-studio-create/ki-input'));
  };

  useEffect(() => {
    if (!kiType) {
      router.replace(route('/(tabs)/(media)/image-studio'));
    }
  }, [kiType]);

  if (!kiType) {
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <ImageUploadStep
        uploadedImageUri={uploadedImageUri}
        onImageSelected={setUploadedImage}
        onClearImage={clearUploadedImage}
        onNext={handleNext}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
