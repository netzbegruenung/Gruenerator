import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';

import CanvasEditorDOM from '../../components/dom/CanvasEditorDOM';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../theme';

export default function WebViewEditorScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { type, formData, modifications, uploadedImageBase64, setGeneratedImage } =
    useImageStudioStore();

  const handleExport = useCallback(
    async (base64: string) => {
      setGeneratedImage(base64);
      router.back();
    },
    [setGeneratedImage]
  );

  const handleCancel = useCallback(async () => {
    router.back();
  }, []);

  const initialState = {
    ...formData,
    ...modifications,
  } as Record<string, unknown>;

  if (!type) {
    router.back();
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar hidden />
      <CanvasEditorDOM
        type={type}
        initialState={initialState}
        imageSrc={uploadedImageBase64 ?? undefined}
        onExport={handleExport}
        onCancel={handleCancel}
        dom={{ matchContents: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
