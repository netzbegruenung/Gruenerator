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
