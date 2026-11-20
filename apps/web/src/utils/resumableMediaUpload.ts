/**
 * Resumable upload of a large video or audio file into the Mediathek: tus to
 * `/api/uploads` in 5 MB chunks (a dropped connection resumes at the last
 * chunk, and the upload survives a reload through the stored upload URL), then
 * `POST /api/media/import-upload`. Images stay on the 50 MB multipart route.
 */
import { type ImportMediaUploadResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { type ResumableUpload } from '@gruenerator/shared/media-library';
import * as tus from 'tus-js-client';

import { getTusAuthOptions } from './tusAuth';

import apiClient from '@/components/utils/apiClient';

const TUS_ENDPOINT = `${apiClient.defaults.baseURL}/uploads`;
const CHUNK_SIZE = 5 * 1024 * 1024;

async function tusUpload(file: File, onProgress: (percent: number) => void): Promise<string> {
  const auth = await getTusAuthOptions();
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      metadata: { filename: file.name, filetype: file.type || 'application/octet-stream' },
      ...auth,
      onError: () => reject(new Error(`„${file.name}“ konnte nicht hochgeladen werden.`)),
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(upload.url?.split('/').pop() ?? ''),
    });
    // Picks an interrupted upload of the same file up where it stopped.
    void upload.findPreviousUploads().then((previous) => {
      const resumable = previous[0];
      if (resumable) upload.resumeFromPreviousUpload(resumable);
      upload.start();
    });
  });
}

export async function uploadToMediathekResumable(
  file: File,
  options: { title?: string; onProgress: (percent: number) => void }
): Promise<ImportMediaUploadResponse> {
  const uploadId = await tusUpload(file, options.onProgress);
  const res = await getContractsClient().mediaImport.importUpload({
    body: { uploadId, title: options.title ?? file.name },
  });
  if (res.status === 201) return res.body;
  const body: unknown = res.body;
  throw new Error(
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `„${file.name}“ konnte nicht übernommen werden.`
  );
}

/** The shape `useMediaUpload` takes for its `resumableUpload` option. */
export const resumableMediathekUpload: ResumableUpload = async (file, options) => {
  const item = await uploadToMediathekResumable(file, options);
  return {
    id: item.mediaId,
    shareToken: item.shareToken,
    shareUrl: item.shareUrl,
    mediaType: item.mediaType,
    createdAt: new Date().toISOString(),
  };
};
