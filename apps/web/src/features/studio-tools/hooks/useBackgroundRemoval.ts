import { useCallback, useEffect, useRef, useState } from 'react';

import { removeImageBackground } from '../../image-studio/services/imageEditingService';
import { fileToDownscaledDataUrl } from '../../image-studio/utils/downscaleImage';

export type BackgroundRemovalStatus = 'idle' | 'processing' | 'done' | 'error';

export const BACKGROUND_REMOVAL_ERROR =
  'Freistellen ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';

async function downscaled(file: File): Promise<File> {
  const dataUrl = await fileToDownscaledDataUrl(file);
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], file.name, { type: blob.type || file.type });
}

export function useBackgroundRemoval({ downscale = false }: { downscale?: boolean } = {}) {
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

  const run = useCallback(
    async (file: File) => {
      const id = ++runRef.current;
      setStatus('processing');
      setCutoutDataUrl(null);
      try {
        const res = await removeImageBackground(downscale ? await downscaled(file) : file);
        URL.revokeObjectURL(res.objectUrl);
        if (id !== runRef.current) return;
        setCutoutDataUrl(res.base64);
        setStatus('done');
      } catch (err) {
        console.error('Freistellen fehlgeschlagen', err);
        if (id === runRef.current) setStatus('error');
      }
    },
    [downscale]
  );

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
