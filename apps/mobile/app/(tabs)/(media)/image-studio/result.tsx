/**
 * Result Screen
 * Final generated image display for Image Studio (KI generation only)
 */

import { Ionicons } from '@expo/vector-icons';
import { useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useRef } from 'react';
import { View, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResultDisplay } from '../../../../components/image-studio/ResultDisplay';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme, colors } from '../../../../theme';
import { route } from '../../../../types/routes';

export default function ResultScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const hasTriggeredGeneration = useRef(false);

  const {
    kiType,
    uploadedImageBase64,
    generatedImage,
    kiLoading,
    error,
    kiInstruction,
    kiVariant,
    kiInfrastructureOptions,
    setGeneratedImage,
    setKiLoading,
    setError,
    setRateLimitExceeded,
    reset,
  } = useImageStudioStore();

  const { generatePureCreate, generateKiEdit } = useKiImageGeneration({
    onImageGenerated: (image) => {
      setGeneratedImage(image);
    },
    onError: (err) => {
      setError(err);
    },
    onRateLimitExceeded: () => {
      setRateLimitExceeded(true);
    },
  });

  const handleGenerate = useCallback(async () => {
    if (!kiType) return;

    setKiLoading(true);
    setError(null);

    try {
      if (kiType === 'pure-create') {
        await generatePureCreate({
          description: kiInstruction,
          variant: kiVariant,
        });
      } else {
        await generateKiEdit(kiType, {
          imageData: uploadedImageBase64 || '',
          instruction: kiInstruction,
          infrastructureOptions: kiType === 'green-edit' ? kiInfrastructureOptions : undefined,
        });
      }
    } catch {
      // Error is handled in onError callback
    } finally {
      setKiLoading(false);
    }
  }, [
    kiType,
    kiInstruction,
    kiVariant,
    kiInfrastructureOptions,
    uploadedImageBase64,
    generatePureCreate,
    generateKiEdit,
    setKiLoading,
    setError,
  ]);

  useEffect(() => {
    if (!generatedImage && !kiLoading && !error && !hasTriggeredGeneration.current) {
      hasTriggeredGeneration.current = true;
      handleGenerate();
    }
  }, []);

  const handleNewGeneration = () => {
    reset();
    router.replace(route('/(tabs)/(media)/image-studio'));
  };

  const handleRetry = () => {
    hasTriggeredGeneration.current = true;
    handleGenerate();
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar hidden />
      <ResultDisplay
        generatedImage={generatedImage}
        loading={kiLoading}
        error={error}
        onNewGeneration={handleNewGeneration}
        onBack={() => router.back()}
        onRetry={handleRetry}
      />
      <Pressable
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={handleNewGeneration}
        hitSlop={12}
      >
        <Ionicons name="close" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
