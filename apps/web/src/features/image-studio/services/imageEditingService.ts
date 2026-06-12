import { type ImageEditReference } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

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

export async function editAiImage(
  image: File | File[],
  instruction: string,
  editType: ImageEditType = 'universal',
  imageModel?: ImageModelId,
  options?: { kiLabel?: boolean }
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
      ...(options?.kiLabel === false && { kiLabel: false }),
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
  if (result.status !== 200) {
    throw new Error('Bearbeitung fehlgeschlagen');
  }

  const base64 = `data:image/jpeg;base64,${result.body.image.base64}`;
  const filename = result.body.image.filename || 'edited.jpg';

  const blob = await (await fetch(base64)).blob();
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  const objectUrl = URL.createObjectURL(file);

  return { file, objectUrl, base64 };
}
