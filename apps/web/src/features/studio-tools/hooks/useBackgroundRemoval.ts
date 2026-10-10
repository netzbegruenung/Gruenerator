import { useCallback, useEffect, useRef, useState } from 'react';

import { removeImageBackground } from '../../image-studio/services/imageEditingService';

export type BackgroundRemovalStatus = 'idle' | 'processing' | 'done' | 'error';

export const BACKGROUND_REMOVAL_ERROR =
  'Freistellen ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';

export function useBackgroundRemoval() {
  const [status, setStatus] = useState<BackgroundRemovalStatus>('idle');
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cutoutDataUrl, setCutoutDataUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const runRef = useRef(0);
  const originalRef = useRef<string | null>(null);

  const revokeOriginal = () => {
    if (originalRef.current) URL.revokeObjectURL(originalRef.current);
    originalRef.current = null;
  };

  const run = useCallback(async (file: File) => {
    const id = ++runRef.current;
    setStatus('processing');
    setCutoutDataUrl(null);
    try {
      const res = await removeImageBackground(file);
      URL.revokeObjectURL(res.objectUrl);
      if (id !== runRef.current) return;
      setCutoutDataUrl(res.base64);
      setStatus('done');
    } catch {
      if (id === runRef.current) setStatus('error');
    }
  }, []);

  const start = useCallback(
    (file: File) => {
      revokeOriginal();
      fileRef.current = file;
      originalRef.current = URL.createObjectURL(file);
      setOriginalUrl(originalRef.current);
      void run(file);
    },
    [run]
  );

  const retry = useCallback(() => {
    if (fileRef.current) void run(fileRef.current);
  }, [run]);

  const reset = useCallback(() => {
    runRef.current++;
    revokeOriginal();
    fileRef.current = null;
    setOriginalUrl(null);
    setCutoutDataUrl(null);
    setStatus('idle');
  }, []);

  useEffect(
    () => () => {
      runRef.current++;
      revokeOriginal();
    },
    []
  );

  return { status, originalUrl, cutoutDataUrl, start, retry, reset };
}
