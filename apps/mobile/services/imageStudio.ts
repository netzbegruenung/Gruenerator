/**
 * Image Studio Service
 * Mobile service for image-studio file handling
 */

import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { Alert, Platform } from 'react-native';
import { shareFile } from './share';
import { getErrorMessage } from '../utils/errors';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import type { Share } from '@gruenerator/shared/share';

/**
 * Image picker result
 */
export interface ImagePickerResult {
  uri: string;
  base64: string;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Request camera permissions
 */
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Kamera-Berechtigung',
      'Bitte erlaube den Zugriff auf die Kamera, um Fotos aufzunehmen.'
    );
    return false;
  }
  return true;
}

/**
 * Request media library permissions
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Galerie-Berechtigung',
      'Bitte erlaube den Zugriff auf die Galerie, um Bilder auszuwählen.'
    );
    return false;
  }
  return true;
}

/**
 * Pick an image from the device gallery
 */
export async function pickImageFromGallery(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) return null;

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      console.error('[ImageStudioService] No base64 data in image');
      return null;
    }

    return {
      uri: asset.uri,
      base64: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType || 'image/jpeg',
    };
  } catch (error: unknown) {
    console.error('[ImageStudioService] pickImageFromGallery error:', getErrorMessage(error));
    Alert.alert('Fehler', 'Das Bild konnte nicht geladen werden.');
    return null;
  }
}

/**
 * Take a photo with the camera
 */
export async function takePhoto(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) return null;

  try {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      console.error('[ImageStudioService] No base64 data in photo');
      return null;
    }

    return {
      uri: asset.uri,
      base64: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType || 'image/jpeg',
    };
  } catch (error: unknown) {
    console.error('[ImageStudioService] takePhoto error:', getErrorMessage(error));
    Alert.alert('Fehler', 'Das Foto konnte nicht aufgenommen werden.');
    return null;
  }
}

/**
 * Convert base64 to file URI for sharing/saving
 */
export async function base64ToFileUri(
  base64Data: string,
  filename: string = `sharepic_${Date.now()}.png`
): Promise<string> {
  // Remove data URI prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

  const file = new File(Paths.cache, filename);

  // Convert base64 to Uint8Array
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Write to file
  file.write(bytes);

  return file.uri;
}

/**
 * Save a base64 image to the device gallery
 */
export async function saveImageToGallery(base64Data: string): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Galerie-Berechtigung',
        'Bitte erlaube den Zugriff auf die Galerie, um Bilder zu speichern.'
      );
      return false;
    }

    // Create temp file
    const fileUri = await base64ToFileUri(base64Data);

    // Save to gallery
    await MediaLibrary.saveToLibraryAsync(fileUri);

    // Clean up temp file
    const file = new File(Paths.cache, fileUri.split('/').pop() || '');
    try {
      file.delete();
    } catch {
      // Ignore cleanup errors - file deletion is non-critical
    }

    Alert.alert('Gespeichert', 'Das Bild wurde in der Galerie gespeichert.');
    return true;
  } catch (error: unknown) {
    console.error('[ImageStudioService] saveImageToGallery error:', getErrorMessage(error));
    Alert.alert('Fehler', 'Das Bild konnte nicht gespeichert werden.');
    return false;
  }
}

/**
 * Share a base64 image via native share sheet
 */
export async function shareImage(base64Data: string): Promise<boolean> {
  try {
    // Create temp file
    const filename = `sharepic_share_${Date.now()}.png`;
    const fileUri = await base64ToFileUri(base64Data, filename);

    // Share
    await shareFile(fileUri, {
      mimeType: 'image/png',
      dialogTitle: 'Sharepic teilen',
    });

    // Clean up temp file
    const file = new File(Paths.cache, filename);
    try {
      file.delete();
    } catch {
      // Ignore cleanup errors - file deletion is non-critical
    }

    return true;
  } catch (error: unknown) {
    console.error('[ImageStudioService] shareImage error:', getErrorMessage(error));
    Alert.alert('Fehler', 'Das Bild konnte nicht geteilt werden.');
    return false;
  }
}

/**
 * Get the data URI for an image (with proper prefix)
 */
export function getImageDataUri(base64Data: string, mimeType: string = 'image/png'): string {
  if (base64Data.startsWith('data:')) {
    return base64Data;
  }
  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Fetch an image from the user's Mediathek (saved shares)
 * Returns the original image if available, otherwise the generated image
 */
export async function fetchMediathekImage(share: Share): Promise<ImagePickerResult | null> {
  try {
    const apiClient = getGlobalApiClient();
    const hasOriginal = share.imageMetadata?.hasOriginalImage === true;

    // Build the URL for the image
    const imageUrl = hasOriginal
      ? `/share/${share.shareToken}/original`
      : `/share/${share.shareToken}`;

    // Fetch the image as blob
    const response = await apiClient.get(imageUrl, {
      responseType: 'blob',
    });

    // Axios throws on non-2xx by default, but check status to be safe
    if (response.status < 200 || response.status >= 300) {
      console.error('[ImageStudioService] Failed to fetch mediathek image:', response.status);
      return null;
    }

    // Convert blob to base64
    const blob = response.data as Blob;
    const base64 = await blobToBase64(blob);

    // Create a temporary file for the URI
    const filename = `mediathek_${share.shareToken}_${Date.now()}.jpg`;
    const fileUri = await base64ToFileUri(base64, filename);

    return {
      uri: fileUri,
      base64: `data:${blob.type || 'image/jpeg'};base64,${base64.replace(/^data:image\/\w+;base64,/, '')}`,
      width: share.imageMetadata?.width || 1080,
      height: share.imageMetadata?.height || 1080,
      mimeType: blob.type || 'image/jpeg',
    };
  } catch (error: unknown) {
    console.error('[ImageStudioService] fetchMediathekImage error:', getErrorMessage(error));
    Alert.alert('Fehler', 'Das Bild konnte nicht aus der Mediathek geladen werden.');
    return null;
  }
}

/**
 * Convert a Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Background removal progress callback
 */
export interface BackgroundRemovalProgress {
  phase: 'uploading' | 'processing' | 'done';
  progress: number;
  message: string;
}

/**
 * Remove background from an image using the backend API
 * Mobile uses backend because WASM is not supported in React Native
 */
export async function removeBackgroundRemote(
  imageBase64: string,
  onProgress?: (progress: BackgroundRemovalProgress) => void
): Promise<string> {
  try {
    onProgress?.({
      phase: 'uploading',
      progress: 0.1,
      message: 'Bild wird hochgeladen...',
    });

    const apiClient = getGlobalApiClient();

    // Create form data with the image
    const formData = new FormData();

    // Convert base64 to blob for upload
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    formData.append('image', blob, 'image.png');

    onProgress?.({
      phase: 'processing',
      progress: 0.3,
      message: 'Hintergrund wird entfernt...',
    });

    const response = await apiClient.post('/background-removal', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    if (!response.data?.image) {
      throw new Error('Hintergrundentfernung fehlgeschlagen');
    }

    onProgress?.({
      phase: 'done',
      progress: 1,
      message: 'Hintergrund entfernt!',
    });

    return response.data.image;
  } catch (error: unknown) {
    console.error('[ImageStudioService] removeBackgroundRemote error:', getErrorMessage(error));
    throw new Error('Der Hintergrund konnte nicht entfernt werden.');
  }
}

/**
 * Generate a profilbild by removing background and compositing on green canvas
 */
export async function generateProfilbild(
  imageBase64: string,
  onProgress?: (progress: BackgroundRemovalProgress) => void
): Promise<string> {
  try {
    // Step 1: Remove background
    onProgress?.({
      phase: 'processing',
      progress: 0.1,
      message: 'Hintergrund wird entfernt...',
    });

    const transparentImage = await removeBackgroundRemote(imageBase64, (progress) => {
      // Scale progress to 0-60%
      onProgress?.({
        ...progress,
        progress: progress.progress * 0.6,
      });
    });

    // Step 2: Composite on green canvas
    onProgress?.({
      phase: 'processing',
      progress: 0.7,
      message: 'Profilbild wird erstellt...',
    });

    const apiClient = getGlobalApiClient();

    // Create form data with the transparent image
    const formData = new FormData();

    // Convert base64 to blob
    const cleanBase64 = transparentImage.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    formData.append('image', blob, 'profilbild.png');

    const response = await apiClient.post('/profilbild_canvas', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    if (!response.data?.image) {
      throw new Error('Profilbild-Erstellung fehlgeschlagen');
    }

    onProgress?.({
      phase: 'done',
      progress: 1,
      message: 'Profilbild erstellt!',
    });

    return response.data.image;
  } catch (error: unknown) {
    console.error('[ImageStudioService] generateProfilbild error:', getErrorMessage(error));
    throw new Error('Das Profilbild konnte nicht erstellt werden.');
  }
}

/**
 * Image studio service object for convenient access
 */
export const imageStudioService = {
  requestCameraPermission,
  requestMediaLibraryPermission,
  pickImageFromGallery,
  takePhoto,
  base64ToFileUri,
  saveImageToGallery,
  shareImage,
  getImageDataUri,
  fetchMediathekImage,
  removeBackgroundRemote,
  generateProfilbild,
};
