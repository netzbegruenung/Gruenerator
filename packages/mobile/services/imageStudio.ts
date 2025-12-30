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
};
