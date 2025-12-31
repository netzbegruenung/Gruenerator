/**
 * KI Input Screen
 * Form input step for KI image generation
 */

import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KiInputStep } from '../../../../components/image-studio/KiInputStep';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function KiInputScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    kiType,
    kiInstruction,
    kiVariant,
    kiInfrastructureOptions,
    uploadedImageUri,
    setKiInstruction,
    setKiVariant,
    toggleKiInfrastructureOption,
  } = useImageStudioStore();

  const handleNext = () => {
    router.push('./result' as Href);
  };

  if (!kiType) {
    router.replace('/(tabs)/(media)/image-studio' as Href);
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <KiInputStep
        kiType={kiType}
        instruction={kiInstruction}
        variant={kiVariant}
        infrastructureOptions={kiInfrastructureOptions}
        uploadedImageUri={uploadedImageUri}
        onInstructionChange={setKiInstruction}
        onVariantChange={setKiVariant}
        onInfrastructureToggle={toggleKiInfrastructureOption}
        onNext={handleNext}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
