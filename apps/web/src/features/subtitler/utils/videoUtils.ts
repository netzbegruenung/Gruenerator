import apiClient from '../../../components/utils/apiClient';

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

const METADATA_TIMEOUT_MS = 10000;

/**
 * Extracts metadata (duration, dimensions) from a video File using a temporary video element.
 * Rejects on undecodable files and after a timeout — without these, a corrupt
 * upload would leave the promise pending forever.
 */
export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Video-Metadaten konnten nicht gelesen werden (Timeout)'));
    }, METADATA_TIMEOUT_MS);

    video.onloadedmetadata = () => {
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Videoformat wird nicht unterstützt oder die Datei ist beschädigt'));
    };

    video.src = objectUrl;
  });
}

export const TUS_UPLOAD_ENDPOINT = `${apiClient.defaults.baseURL}/subtitler/upload`;

/**
 * Plain (non-hook) TUS upload to the subtitler endpoint. Used by surfaces
 * outside the studio wizard — e.g. chat video attachments — that only need
 * the uploadId. Same retry/chunk settings as useTusUpload. Returns an abort
 * handle so callers can stop the transfer when the user removes the
 * attachment (a 500MB upload must not keep saturating the upstream).
 */
export function uploadVideoToTus(
  file: File,
  onProgress?: (pct: number) => void
): { promise: Promise<{ uploadId: string }>; abort: () => void } {
  let aborted = false;
  let tusHandle: { abort: (shouldTerminate?: boolean) => Promise<void> } | null = null;

  const promise = new Promise<{ uploadId: string }>((resolve, reject) => {
    void import('tus-js-client').then((tus) => {
      if (aborted) {
        reject(new Error('Upload abgebrochen.'));
        return;
      }
      const tusUpload = new tus.Upload(file, {
        endpoint: TUS_UPLOAD_ENDPOINT,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        chunkSize: 5 * 1024 * 1024,
        metadata: { filename: file.name, filetype: file.type },
        onError: () => {
          reject(
            new Error(
              aborted ? 'Upload abgebrochen.' : 'Upload fehlgeschlagen. Bitte versuche es erneut.'
            )
          );
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
        },
        onSuccess: () => {
          const uploadUrl = tusUpload.url;
          const secureUrl = uploadUrl?.startsWith('http://localhost')
            ? uploadUrl
            : (uploadUrl?.replace('http://', 'https://') ?? '');
          const uploadId = secureUrl.split('/').pop() ?? '';
          if (!uploadId) {
            reject(new Error('Upload fehlgeschlagen. Bitte versuche es erneut.'));
            return;
          }
          resolve({ uploadId });
        },
      });
      tusHandle = tusUpload;
      tusUpload.start();
      if (aborted) {
        // abort() raced the dynamic import — terminate now that we can.
        void tusUpload.abort(true).catch(() => {});
        reject(new Error('Upload abgebrochen.'));
      }
    }, reject);
  });

  return {
    promise,
    abort: () => {
      aborted = true;
      // shouldTerminate=true deletes the partial upload server-side.
      void tusHandle?.abort(true).catch(() => {});
    },
  };
}
