import { useCallback, useRef, useState } from 'react';
import * as tus from 'tus-js-client';

import { getVideoMetadata, TUS_UPLOAD_ENDPOINT } from '../../subtitler/utils/videoUtils';

import type { VideoMetadata } from '../../subtitler/utils/videoUtils';

export interface TusUploadResult {
  uploadId: string;
  metadata: VideoMetadata;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export function useTusUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const upload = useCallback(
    (file: File): Promise<TusUploadResult> =>
      new Promise((resolve, reject) => {
        setIsUploading(true);
        setProgress(0);
        setError(null);

        getVideoMetadata(file)
          .then((metadata) => {
            const tusUpload = new tus.Upload(file, {
              endpoint: TUS_UPLOAD_ENDPOINT,
              retryDelays: [0, 3000, 5000, 10000, 20000],
              chunkSize: 5 * 1024 * 1024,
              metadata: { filename: file.name, filetype: file.type },
              onError: () => {
                const msg = 'Upload fehlgeschlagen. Bitte versuche es erneut.';
                setError(msg);
                setIsUploading(false);
                uploadRef.current = null;
                reject(new Error(msg));
              },
              onProgress: (bytesUploaded, bytesTotal) => {
                setProgress(Math.round((bytesUploaded / bytesTotal) * 100));
              },
              onSuccess: () => {
                const uploadUrl = tusUpload.url;
                const secureUrl = uploadUrl?.startsWith('http://localhost')
                  ? uploadUrl
                  : (uploadUrl?.replace('http://', 'https://') ?? '');
                const uploadId = secureUrl.split('/').pop() ?? '';

                setIsUploading(false);
                uploadRef.current = null;

                resolve({
                  uploadId,
                  metadata,
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type,
                });
              },
            });

            uploadRef.current = tusUpload;
            tusUpload.start();
          })
          .catch((err) => {
            setError('Video-Metadaten konnten nicht gelesen werden.');
            setIsUploading(false);
            reject(err);
          });
      }),
    []
  );

  const cancel = useCallback(() => {
    if (uploadRef.current) {
      void uploadRef.current.abort();
      uploadRef.current = null;
    }
    setIsUploading(false);
    setProgress(0);
  }, []);

  return { upload, cancel, progress, isUploading, error };
}
