import apiClient from '../../../components/utils/apiClient';

interface UniversalEditResponse {
  image: string | { base64: string; filename?: string };
}

export type ImageEditType = 'universal' | 'green-edit';

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
  image: File,
  instruction: string,
  editType: ImageEditType = 'universal'
): Promise<{ file: File; objectUrl: string; base64: string }> {
  const form = new FormData();
  form.append('image', image);
  form.append('text', instruction);
  form.append('precision', 'true');
  form.append('type', editType);

  const response = await apiClient.post<UniversalEditResponse>('/flux/green-edit/prompt', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const payload = response.data?.image;
  if (!payload) throw new Error('Keine Bilddaten empfangen');

  const base64 = typeof payload === 'string' ? payload : payload.base64;
  const filename = typeof payload === 'string' ? 'edited.png' : (payload.filename ?? 'edited.png');

  const blob = await (await fetch(base64)).blob();
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const objectUrl = URL.createObjectURL(file);

  return { file, objectUrl, base64 };
}
