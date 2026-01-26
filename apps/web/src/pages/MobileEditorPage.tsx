import { useState, useEffect, useCallback } from 'react';

import { MasterCanvasEditor } from '../features/image-studio/canvas-editor/MasterCanvasEditor';
import { useAuthStore } from '../stores/authStore';

interface MobileEditorData {
  type: string;
  formData: Record<string, any>;
  modifications: Record<string, any> | null;
  generatedImageBase64?: string; // The previously generated image (used for reconstruction or reference)
  sourceImageBase64?: string; // The raw source image for editing (e.g., uploaded background)
  authToken?: string;
}

export default function MobileEditorPage() {
  const [data, setData] = useState<MobileEditorData | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        if (message.type === 'INIT_DATA') {
          const payload = message.payload as MobileEditorData;

          // Auth token is available in payload.authToken if needed for API requests
          // It can be used via apiClient or other HTTP methods

          setData(payload);
          setIsReady(true);
        }
      } catch (err) {
        console.error('[MobileEditorPage] Failed to parse message', err);
      }
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as EventListener);

    const readyMessage = JSON.stringify({ type: 'EDITOR_READY' });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(readyMessage);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage as EventListener);
    };
  }, []);

  const handleExport = useCallback((base64: string) => {
    const message = JSON.stringify({
      type: 'SAVE_IMAGE',
      payload: { image: base64 },
    });
    window.ReactNativeWebView?.postMessage(message);
  }, []);

  const handleCancel = useCallback(() => {
    const message = JSON.stringify({ type: 'CANCEL' });
    window.ReactNativeWebView?.postMessage(message);
  }, []);

  if (!isReady || !data) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: 'var(--background-color)',
        }}
      >
        Lade Editor...
      </div>
    );
  }

  const initialState = {
    ...data.formData,
    ...(data.modifications || {}),
  };

  return (
    <MasterCanvasEditor
      type={data.type}
      initialState={initialState}
      imageSrc={data.sourceImageBase64} // Pass the raw source image for editing
      onExport={handleExport}
      onCancel={handleCancel}
    />
  );
}

// Add types for window
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}
