/**
 * Image Studio Service
 * Mobile service for image-studio file handling
 */

import { stripDataUrlPrefix } from '@gruenerator/shared/utils';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';

import { getErrorMessage } from '../utils/errors';

import { alertSavedToGallery } from './gallery';
import { shareFile } from './share';

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
 * Convert base64 to file URI for sharing/saving
 */
export async function base64ToFileUri(
  base64Data: string,
  filename: string = `sharepic_${Date.now()}.png`
): Promise<string> {
  // Remove data URI prefix if present
  const cleanBase64 = stripDataUrlPrefix(base64Data);

  const file = new File(Paths.cache, filename);

  // Convert base64 to Uint8Array
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Write to file
  file.writeSync(bytes);

  return file.uri;
}

/**
 * Saves a file that is already on disk to the gallery (write-only permission),
 * then confirms with a way into the gallery. False when the user declined or
 * the save failed — the user has been told either way.
 */
export async function saveFileToGallery(fileUri: string, mime: string): Promise<boolean> {
  const video = mime.toLowerCase().startsWith('video/');
  try {
    // Write-only: saving only, never reading the library.
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      Alert.alert(
        'Galerie-Berechtigung',
        `Bitte erlaube den Zugriff auf die Galerie, um ${video ? 'Videos' : 'Bilder'} zu speichern.`
      );
      return false;
    }
    // SDK 56 class-based API — saveToLibraryAsync now throws. `asset.id` is the
    // MediaStore content URI on Android — the only handle that lets the success
    // alert offer a way into the gallery.
    const asset = await MediaLibrary.Asset.create(fileUri);
    alertSavedToGallery(
      asset.id,
      video
        ? 'Das Video wurde in der Galerie gespeichert.'
        : 'Das Bild wurde in der Galerie gespeichert.'
    );
    return true;
  } catch (error: unknown) {
    console.error('[ImageStudioService] saveFileToGallery error:', getErrorMessage(error));
    Alert.alert(
      'Fehler',
      video
        ? 'Das Video konnte nicht gespeichert werden.'
        : 'Das Bild konnte nicht gespeichert werden.'
    );
    return false;
  }
}

/**
 * Save a base64 image to the device gallery
 */
export async function saveImageToGallery(
  base64Data: string,
  /**
   * Name for the temp file the gallery asset is created from. Without it every
   * image is written as `.png`, which mislabels a JPEG or WebP export.
   */
  filename?: string
): Promise<boolean> {
  let fileUri: string;
  try {
    fileUri = filename
      ? await base64ToFileUri(base64Data, filename)
      : await base64ToFileUri(base64Data);
  } catch (error: unknown) {
    console.error('[ImageStudioService] saveImageToGallery error:', getErrorMessage(error));
    Alert.alert('Fehler', 'Das Bild konnte nicht gespeichert werden.');
    return false;
  }

  const saved = await saveFileToGallery(fileUri, 'image/*');

  // Clean up temp file
  const file = new File(Paths.cache, fileUri.split('/').pop() || '');
  try {
    file.delete();
  } catch {
    // Ignore cleanup errors - file deletion is non-critical
  }
  return saved;
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
