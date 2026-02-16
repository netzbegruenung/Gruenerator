import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KiInputStep } from '../../../components/image-studio/KiInputStep';
import { useImageStudioStore } from '../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../theme';
import { route } from '../../../types/routes';

export default function KiInputScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    kiType,
    kiInstruction,
    kiVariant,
    kiVariantPreSelected,
    kiInfrastructureOptions,
    uploadedImageUri,
    setKiInstruction,
    setKiVariant,
    toggleKiInfrastructureOption,
  } = useImageStudioStore();

  const handleNext = () => {
    router.push(route('/(focused)/image-studio-create/result'));
  };

  if (!kiType) {
    router.replace(route('/(tabs)/(media)/image-studio'));
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <KiInputStep
        kiType={kiType}
        instruction={kiInstruction}
        variant={kiVariant}
        infrastructureOptions={kiInfrastructureOptions}
        uploadedImageUri={uploadedImageUri}
        variantPreSelected={kiVariantPreSelected}
        onInstructionChange={setKiInstruction}
        onVariantChange={setKiVariant}
        onInfrastructureToggle={toggleKiInfrastructureOption}
        onNext={handleNext}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
