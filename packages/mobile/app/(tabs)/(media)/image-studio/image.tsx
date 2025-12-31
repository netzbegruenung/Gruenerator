/**
 * Image Upload Screen
 * Image upload step for Image Studio (templates and KI edit types)
 */

import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { typeHasTextGeneration } from '@gruenerator/shared/image-studio';
import { ImageUploadStep } from '../../../../components/image-studio/ImageUploadStep';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function ImageScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    type,
    kiType,
    uploadedImageUri,
    setUploadedImage,
    clearUploadedImage,
  } = useImageStudioStore();

  const handleNext = () => {
    // KI edit types go to ki-input for instruction entry
    if (kiType) {
      router.push('./ki-input' as Href);
      return;
    }

    // Template types follow existing flow
    if (!type) return;

    if (typeHasTextGeneration(type)) {
      router.push('./text' as Href);
    } else {
      router.push('./result' as Href);
    }
  };

  // Redirect if neither type nor kiType is selected
  if (!type && !kiType) {
    router.replace('/(tabs)/(media)/image-studio' as Href);
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
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
