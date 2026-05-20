import apiClient from '../../../components/utils/apiClient';

interface BackgroundRemovalResponse {
  image: string; // data:image/png;base64,...
  success: boolean;
}

/**
 * Calls the backend rembg sidecar for background removal.
 * Backend route: POST /api/background-removal (multipart, field name `image`).
 * Returns a transparent PNG as a base64 data URL which we hydrate into a File.
 */
export async function removeBackgroundFromImage(
  source: File | Blob,
  onProgress?: (p: { phase: string; progress: number; message: string }) => void
): Promise<{ file: File; objectUrl: string }> {
  onProgress?.({
    phase: 'uploading',
    progress: 0.1,
    message: 'Bild wird hochgeladen…',
  });

  const filename =
    source instanceof File
      ? source.name.replace(/\.[^.]+$/, '') + '-transparent.png'
      : 'transparent.png';

  const formData = new FormData();
  const inputBlob = source instanceof File ? source : new File([source], 'image.png');
  formData.append('image', inputBlob);

  onProgress?.({
    phase: 'processing',
    progress: 0.4,
    message: 'Hintergrund wird entfernt…',
  });

  const response = await apiClient.post<BackgroundRemovalResponse>(
    '/background-removal',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );

  if (!response.data?.image) {
    throw new Error('Hintergrundentfernung fehlgeschlagen');
  }

  const blob = await (await fetch(response.data.image)).blob();
  const file = new File([blob], filename, { type: 'image/png' });
  const objectUrl = URL.createObjectURL(file);

  onProgress?.({
    phase: 'done',
    progress: 1,
    message: 'Fertig',
  });

  return { file, objectUrl };
}
