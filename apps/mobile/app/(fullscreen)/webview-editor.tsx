import { router, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';

import { WebViewEditor } from '../../components/image-studio/WebViewEditor';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { route } from '../../types/routes';

export default function WebViewEditorScreen() {
  const { type, formData, modifications, uploadedImageBase64, setGeneratedImage } =
    useImageStudioStore();

  // Shape must match MobileEditorData in apps/web/src/pages/MobileEditorPage.tsx
  const initialData = useMemo(
    () => ({
      type,
      formData,
      modifications,
      ...(uploadedImageBase64 ? { sourceImageBase64: uploadedImageBase64 } : {}),
    }),
    [type, formData, modifications, uploadedImageBase64]
  );

  const handleSave = useCallback(
    (base64: string) => {
      setGeneratedImage(base64);
      router.back();
    },
    [setGeneratedImage]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  // Declarative redirect — navigation-safe, unlike router.back() during render
  // (which mutates the navigation container mid-render and triggers
  // "Cannot update NavigationContainerInner while rendering WebViewEditorScreen").
  if (!type) {
    return <Redirect href={route('/(tabs)/(tools)/image-studio')} />;
  }

  return (
    <>
      <StatusBar hidden />
      <WebViewEditor initialData={initialData} onSave={handleSave} onCancel={handleCancel} />
    </>
  );
}
