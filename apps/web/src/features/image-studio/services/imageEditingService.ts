import {
  isAiConsentRequiredBody,
  type Flux3BoxEdit,
  type Flux3DetectedElement,
  type ImageEditReference,
  type KiLabelMode,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { IMAGE_FORMATS, type ImageFormatId } from '@gruenerator/shared/image-studio';

import apiClient from '../../../components/utils/apiClient';

import type { ImageModelId } from '@gruenerator/shared/models';

export type ImageEditType = 'universal' | 'green-edit';

/**
 * Per-image pixel cap mirroring the server-side budget (BFL caps input +
 * output at 9MP combined; ~1MP is reserved for the output). Downscaling
 * client-side keeps the base64 JSON payload well under the body limit.
 */
const TOTAL_INPUT_BUDGET_MP = 8;

function isSupportedMimeType(type: string): type is ImageEditReference['type'] {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

async function fileToReference(file: File, capPx: number): Promise<ImageEditReference> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`„${file.name}" konnte nicht gelesen werden. Bitte nutze JPEG, PNG oder WebP.`);
  }

  const pixels = bitmap.width * bitmap.height;

  if (pixels <= capPx && isSupportedMimeType(file.type)) {
    bitmap.close();
    const data = await fileToBase64(file);
    return { name: file.name, type: file.type, data };
  }

  const scale = pixels > capPx ? Math.sqrt(capPx / pixels) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
  canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Bildverarbeitung fehlgeschlagen');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  );
  if (!blob) throw new Error('Bildverarbeitung fehlgeschlagen');

  const data = await blobToBase64(blob);
  return { name: file.name, type: 'image/jpeg', data };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    reader.readAsDataURL(blob);
  });
}

function fileToBase64(file: File): Promise<string> {
  return blobToBase64(file);
}

interface BackgroundRemovalResponse {
  image: string;
  success?: boolean;
}

export async function removeImageBackground(
  image: File
): Promise<{ file: File; objectUrl: string; base64: string }> {
  const form = new FormData();
  form.append('image', image);

  const response = await apiClient.post<BackgroundRemovalResponse>('/background-removal', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const base64 = response.data?.image;
  if (!base64) throw new Error('Keine Bilddaten empfangen');

  const blob = await (await fetch(base64)).blob();
  const filename = image.name.replace(/\.[^.]+$/, '') + '-no-bg.png';
  const file = new File([blob], filename, { type: 'image/png' });
  const objectUrl = URL.createObjectURL(file);

  return { file, objectUrl, base64 };
}

export async function outpaintImage(
  file: File,
  aspectRatio: string,
  kiLabel: KiLabelMode
): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  form.append('aspectRatio', aspectRatio);
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

/** What a failed outpaint tells the user: the server's validation text, budget, consent, or a retry hint. */
export function outpaintErrorMessage(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { error?: unknown } } })
    ?.response;
  const status = response?.status;
  if (status === 400 && typeof response?.data?.error === 'string' && response.data.error) {
    return response.data.error;
  }
  if (status === 403 && isAiConsentRequiredBody(response?.data)) {
    return 'Für die KI-Funktionen fehlt deine Einwilligung.';
  }
  if (status === 429) return 'Dein Bild-Budget für heute ist aufgebraucht.';
  if (status === 503)
    return 'Das Budget ist gerade nicht abrufbar. Bitte versuche es später erneut.';
  return 'Erweitern hat nicht geklappt. Bitte versuche es noch einmal.';
}

/**
 * The outpaint preset closest to `aspect` (width / height), compared on a log
 * scale so 2:1 and 1:2 are equally far from 1:1. A preset, not `custom`: only
 * then does the server scale source and canvas into BFL's budget (#3388).
 */
export function nearestOutpaintFormat(aspect: number): ImageFormatId {
  const target = Math.log(aspect);
  let best: ImageFormatId = IMAGE_FORMATS[0].id;
  let bestDistance = Infinity;
  for (const format of IMAGE_FORMATS) {
    const distance = Math.abs(Math.log(format.width / format.height) - target);
    if (distance < bestDistance) {
      best = format.id;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * „Erweitern" in the canvas editor: outpaints to the frame's nearest preset.
 * Carries the full AI label, like every AI image the editor places
 * (`editAiImage`, `generateAiImage` and the Bild-Editor never pass another).
 */
export async function expandCanvasImage(image: File, aspect: number): Promise<File> {
  let dataUrl: string;
  try {
    dataUrl = await outpaintImage(image, nearestOutpaintFormat(aspect), 'full');
  } catch (err) {
    // `userFacing`: der Editor zeigt nur so markierte Meldungen (Vertrag von `expandImage`).
    throw Object.assign(new Error(outpaintErrorMessage(err)), { userFacing: true as const });
  }
  const blob = await (await fetch(dataUrl)).blob();
  const type = blob.type || 'image/jpeg';
  return new File([blob], `erweitert.${type === 'image/jpeg' ? 'jpg' : 'png'}`, { type });
}

export async function editAiImage(
  image: File | File[],
  instruction: string,
  editType: ImageEditType = 'universal',
  imageModel?: ImageModelId,
  options?: { kiLabel?: KiLabelMode; boxes?: 'auto' | Flux3BoxEdit }
): Promise<{ file: File; objectUrl: string; base64: string }> {
  const files = Array.isArray(image) ? image : [image];
  if (files.length === 0) throw new Error('Kein Bild ausgewählt');

  const capPx = Math.max(1, Math.floor(TOTAL_INPUT_BUDGET_MP / files.length)) * 1_000_000;
  const images = await Promise.all(files.map((f) => fileToReference(f, capPx)));

  const result = await getContractsClient().imageEdit.edit({
    body: {
      instruction,
      images,
      editType,
      precision: true,
      ...(imageModel && { imageModel }),
      ...(options?.kiLabel && options.kiLabel !== 'full' && { kiLabel: options.kiLabel }),
      ...(options?.boxes && { boxes: options.boxes }),
    },
  });

  if (
    result.status === 400 ||
    result.status === 401 ||
    result.status === 429 ||
    result.status === 500 ||
    result.status === 503
  ) {
    throw new ApiError(result.status, result.body.error);
  }
  if (result.status !== 200) {
    throw new ApiError(result.status, 'Bearbeitung fehlgeschlagen');
  }

  const base64 = `data:image/jpeg;base64,${result.body.image.base64}`;
  const filename = result.body.image.filename || 'edited.jpg';

  const blob = await (await fetch(base64)).blob();
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  const objectUrl = URL.createObjectURL(file);

  return { file, objectUrl, base64 };
}

/** Experimental (FLUX 3): the elements of an image with bounding boxes. */
export async function detectImageElements(image: File): Promise<Flux3DetectedElement[]> {
  const reference = await fileToReference(image, TOTAL_INPUT_BUDGET_MP * 1_000_000);
  const result = await getContractsClient().imageEdit.elements({ body: { image: reference } });
  if (result.status === 400 || result.status === 401 || result.status === 500) {
    throw new ApiError(result.status, result.body.error);
  }
  if (result.status !== 200) {
    throw new ApiError(result.status, 'Elemente konnten nicht erkannt werden');
  }
  return result.body.elements;
}
