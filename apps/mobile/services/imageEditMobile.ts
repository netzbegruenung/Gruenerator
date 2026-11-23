/**
 * Picks or takes a photo and prepares it as a modest local upload, for the
 * Profilbild and the Sticker-Creator.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { requestCameraPermission } from './imageStudio';

/** A stored image: a local file URI plus its source pixel dimensions. */
export interface BevImageRef {
  uri: string;
  width: number;
  height: number;
}

const MAX_UPLOAD_EDGE = 1400; // keep uploaded sources modest

async function dimensionsOf(uri: string): Promise<{ width: number; height: number }> {
  const info = await manipulateAsync(uri, [], {});
  return { width: info.width, height: info.height };
}

/** Downscale a picked/captured image to a modest edge and return a cache file ref. */
export async function prepareUploadFromUri(uri: string): Promise<BevImageRef> {
  const { width, height } = await dimensionsOf(uri);
  const longest = Math.max(width, height);
  const resize =
    longest > MAX_UPLOAD_EDGE
      ? width >= height
        ? { width: MAX_UPLOAD_EDGE }
        : { height: MAX_UPLOAD_EDGE }
      : null;
  const res = await manipulateAsync(uri, resize ? [{ resize }] : [], {
    compress: 0.87,
    format: SaveFormat.JPEG,
  });
  return { uri: res.uri, width: res.width, height: res.height };
}

export async function pickImageForEditor(): Promise<BevImageRef | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  return prepareUploadFromUri(result.assets[0].uri);
}

export async function takePhotoForEditor(): Promise<BevImageRef | null> {
  if (!(await requestCameraPermission())) return null;
  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  return prepareUploadFromUri(result.assets[0].uri);
}
