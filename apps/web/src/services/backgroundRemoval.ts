import { removeBackground as imglyRemoveBackground } from '@imgly/background-removal';
import imageCompression from 'browser-image-compression';

export interface BackgroundRemovalProgress {
  phase: 'downloading' | 'processing' | 'compressing';
  progress: number;
  message: string;
}

export interface BackgroundRemovalResult {
  blob: Blob;
  url: string;
}

const MAX_IMAGE_SIZE = 1080;

async function compressImageForProcessing(imageSource: string | Blob): Promise<Blob> {
  let file: File;

  if (typeof imageSource === 'string') {
    const response = await fetch(imageSource);
    const blob = await response.blob();
    file = new File([blob], 'image.jpg', { type: blob.type });
  } else if (imageSource instanceof File) {
    file = imageSource;
  } else {
    file = new File([imageSource], 'image.jpg', { type: imageSource.type });
  }

  const compressedFile = await imageCompression(file, {
    maxWidthOrHeight: MAX_IMAGE_SIZE,
    useWebWorker: true,
    preserveExif: false,
    fileType: 'image/png'
  });

  return compressedFile;
}

export async function removeBackground(
  imageSource: string | Blob,
  onProgress?: (progress: BackgroundRemovalProgress) => void
): Promise<BackgroundRemovalResult> {
  onProgress?.({
    phase: 'compressing',
    progress: 0,
    message: 'Bild wird optimiert...'
  });

  const compressedBlob = await compressImageForProcessing(imageSource);

  onProgress?.({
    phase: 'compressing',
    progress: 1,
    message: 'Bild wurde optimiert'
  });

  const config = {
    progress: (key: string, current: number, total: number) => {
      if (onProgress) {
        const isDownloading = key.includes('fetch') || key.includes('model') || key.includes('download');
        const phase = isDownloading ? 'downloading' : 'processing';
        const percentage = Math.round((current / total) * 100);

        const message = isDownloading
          ? `KI-Modell wird geladen... ${percentage}%`
          : `Hintergrund wird entfernt... ${percentage}%`;

        onProgress({
          phase,
          progress: current / total,
          message
        });
      }
    }
  };

  const blob = await imglyRemoveBackground(compressedBlob, config);
  const url = URL.createObjectURL(blob);

  return { blob, url };
}

export async function removeBackgroundFromFile(
  file: File,
  onProgress?: (progress: BackgroundRemovalProgress) => void
): Promise<BackgroundRemovalResult> {
  return removeBackground(file, onProgress);
}

export async function removeBackgroundFromUrl(
  imageUrl: string,
  onProgress?: (progress: BackgroundRemovalProgress) => void
): Promise<BackgroundRemovalResult> {
  return removeBackground(imageUrl, onProgress);
}

export function cleanupBackgroundRemovalUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
