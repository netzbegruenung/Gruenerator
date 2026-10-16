import { getGlobalApiClient } from '@gruenerator/shared/api';
import { type UploadSource } from '@gruenerator/shared/media-library';

/** Uploads a local file to the media store; returns its share token, null if none came back. */
export async function uploadToMediaShare(
  uri: string,
  name: string,
  type: string,
  uploadSource: UploadSource
): Promise<string | null> {
  const form = new FormData();
  // RN's FormData takes a file descriptor; `new Blob([bytes])` throws on RN.
  form.append('file', { uri, name, type } as unknown as Blob);
  form.append('uploadSource', uploadSource);
  const res = await getGlobalApiClient().post<{ data?: { shareToken?: string } }>(
    '/media/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data?.data?.shareToken ?? null;
}
