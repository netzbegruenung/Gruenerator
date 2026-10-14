import { getGlobalApiClient } from '@gruenerator/shared/api';

/** Uploads a sticker PNG to the media store and returns its share token, as web's uploadBlobToMediaShare. */
export async function uploadStickerPng(uri: string, filename: string): Promise<string> {
  const form = new FormData();
  // RN's FormData takes a file descriptor; `new Blob([bytes])` throws on RN.
  form.append('file', { uri, name: filename, type: 'image/png' } as unknown as Blob);
  form.append('uploadSource', 'studio-asset');
  const res = await getGlobalApiClient().post<{ data?: { shareToken?: string } }>(
    '/media/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  const token = res.data?.data?.shareToken;
  if (!token) throw new Error('upload failed');
  return token;
}
