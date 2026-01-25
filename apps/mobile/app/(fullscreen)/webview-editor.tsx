import { useCallback } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebViewEditor } from '../../components/image-studio/WebViewEditor';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../theme';

export default function WebViewEditorScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { type, formData, modifications, uploadedImageBase64, setGeneratedImage, setLoading } =
    useImageStudioStore();

  const handleSave = useCallback(
    (base64: string) => {
      // Update the generated image in the store
      setGeneratedImage(base64);
      // Go back to the result screen
      router.back();
    },
    [setGeneratedImage]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  // Prepare the data payload
  const initialData = {
    type,
    formData,
    modifications,
    generatedImageBase64: uploadedImageBase64, // The previously generated image
    sourceImageBase64: uploadedImageBase64, // The original uploaded image for editing
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar hidden />
      <WebViewEditor initialData={initialData} onSave={handleSave} onCancel={handleCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
