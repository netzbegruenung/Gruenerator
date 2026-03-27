import apiClient from '../../../components/utils/apiClient';

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

/**
 * Extracts metadata (duration, dimensions) from a video File using a temporary video element.
 */
export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
}

export const TUS_UPLOAD_ENDPOINT = `${apiClient.defaults.baseURL}/subtitler/upload`;
