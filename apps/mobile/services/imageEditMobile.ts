/**
 * Bild-Editor mobile image service.
 *
 * Native equivalent of the web
 * `apps/web/src/features/image-studio/services/imageEditingService.ts`. The web
 * version leans on the browser (`canvas`, `createImageBitmap`, `FileReader`); here
 * the same work is done with `expo-image-manipulator` + `expo-file-system`, while
 * the backend contracts (`imageEdit.edit`, `/imagine/outpaint`, `/background-removal`)
 * stay identical.
 */

import { type ImageEditReference, type KiLabelMode } from '@gruenerator/contracts';
import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { base64ToFileUri, removeBackgroundRemote, requestCameraPermission } from './imageStudio';

import type { BevAspect } from '../components/image-studio/bild-editor/types';

/** A stored image: a local file URI plus its source pixel dimensions. */
export interface BevImageRef {
  uri: string;
  width: number;
  height: number;
}

export type ImageEditType = 'universal' | 'green-edit';

const MAX_EDIT_IMAGES = 8; // contract cap: active version + references
const TOTAL_INPUT_BUDGET_MP = 8; // mirrors the server-side BFL input budget
const MAX_UPLOAD_EDGE = 1400; // keep uploaded sources modest

// Outpaint budget — mirrors the server-side values used by the web „Vergrößern".
const MIN_OUTPAINT_SIDE = 256;
const MAX_OUTPAINT_SIDE = 2048;
const MAX_OUTPAINT_AREA = 4_194_304;
const SAME_RATIO_EXPANSION = 1.22;

const ASPECT_VALUE: Record<BevAspect, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
};

let fileCounter = 0;
function uniqueName(ext: string): string {
  fileCounter += 1;
  return `bev-${Date.now()}-${fileCounter}.${ext}`;
}

async function dimensionsOf(uri: string): Promise<{ width: number; height: number }> {
  const info = await manipulateAsync(uri, [], {});
  return { width: info.width, height: info.height };
}

/** Persist an API-produced data URL to a cache file and read back its dimensions. */
export async function writeDataUrlToCache(dataUrl: string): Promise<BevImageRef> {
  const uri = await base64ToFileUri(dataUrl, uniqueName('jpg'));
  const { width, height } = await dimensionsOf(uri);
  return { uri, width, height };
}

/** Read a cached file back as a JPEG data URL (for share/download/create-share). */
export async function readAsDataUrl(uri: string): Promise<string> {
  const base64 = await new File(uri).base64();
  return `data:image/jpeg;base64,${base64}`;
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

async function toReference(ref: BevImageRef, capPx: number): Promise<ImageEditReference> {
  const pixels = ref.width * ref.height;
  const scale = pixels > capPx ? Math.sqrt(capPx / pixels) : 1;
  const resize =
    scale < 1
      ? ref.width >= ref.height
        ? { width: Math.round(ref.width * scale) }
        : { height: Math.round(ref.height * scale) }
      : null;
  const res = await manipulateAsync(ref.uri, resize ? [{ resize }] : [], {
    base64: true,
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  return { name: 'image.jpg', type: 'image/jpeg', data: res.base64 ?? '' };
}

/** Instruction edit / green transform via the imageEdit contract. Returns a data URL. */
export async function editAiImageMobile(
  refs: BevImageRef[],
  instruction: string,
  editType: ImageEditType,
  kiLabel?: KiLabelMode
): Promise<string> {
  const images = refs.slice(0, MAX_EDIT_IMAGES);
  if (images.length === 0) throw new Error('Kein Bild ausgewählt');

  const capPx = Math.max(1, Math.floor(TOTAL_INPUT_BUDGET_MP / images.length)) * 1_000_000;
  const references = await Promise.all(images.map((r) => toReference(r, capPx)));

  const result = await getContractsClient().imageEdit.edit({
    body: {
      instruction,
      images: references,
      editType,
      precision: true,
      ...(kiLabel && kiLabel !== 'full' && { kiLabel }),
    },
  });

  if (
    result.status === 400 ||
    result.status === 401 ||
    result.status === 429 ||
    result.status === 500
  ) {
    throw new Error(result.body.error);
  }
  if (result.status !== 200) throw new Error('Bearbeitung fehlgeschlagen');

  return `data:image/jpeg;base64,${result.body.image.base64}`;
}

export function computeOutpaintGeometry(
  srcW: number,
  srcH: number,
  aspect: BevAspect
): { width: number; height: number } {
  const target = ASPECT_VALUE[aspect];
  const input = srcW / srcH;
  let tw: number;
  let th: number;
  if (Math.abs(input - target) < 0.01) {
    tw = Math.round(srcW * SAME_RATIO_EXPANSION);
    th = Math.round(srcH * SAME_RATIO_EXPANSION);
  } else if (input > target) {
    tw = srcW;
    th = Math.round(srcW / target);
  } else {
    tw = Math.round(srcH * target);
    th = srcH;
  }
  return { width: tw, height: th };
}

/** Outpaint (Vergrößern) via the multipart `/imagine/outpaint` route. Returns a data URL. */
export async function outpaintMobile(
  ref: BevImageRef,
  aspect: BevAspect,
  kiLabel: KiLabelMode
): Promise<string> {
  const geo = computeOutpaintGeometry(ref.width, ref.height, aspect);
  if (Math.max(geo.width, geo.height) > MAX_OUTPAINT_SIDE) {
    throw new Error(
      `Dein Bild ist zu groß für das Format ${aspect}. Bitte ein kleineres Bild verwenden.`
    );
  }
  if (geo.width < MIN_OUTPAINT_SIDE || geo.width * geo.height > MAX_OUTPAINT_AREA) {
    throw new Error('Zielgröße außerhalb des erlaubten Bereichs.');
  }

  const form = new FormData();
  form.append('image', {
    uri: ref.uri,
    name: 'image.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  form.append('aspectRatio', 'custom');
  form.append('width', String(geo.width));
  form.append('height', String(geo.height));
  if (kiLabel !== 'full') form.append('kiLabel', kiLabel);

  const res = await getGlobalApiClient().post<{
    success: boolean;
    image?: { base64?: string };
    error?: string;
  }>('/imagine/outpaint', form, { headers: { 'Content-Type': 'multipart/form-data' } });

  if (!res.data.success || !res.data.image?.base64) {
    throw new Error(res.data.error || 'Vergrößerung fehlgeschlagen');
  }
  const raw = res.data.image.base64;
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
}

/** Background removal via `/background-removal`. Returns a data URL. */
export async function removeBackgroundMobile(ref: BevImageRef): Promise<string> {
  const base64 = await new File(ref.uri).base64();
  return removeBackgroundRemote(base64);
}
