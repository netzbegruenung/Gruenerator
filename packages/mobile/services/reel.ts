import * as tus from 'tus-js-client';
import { Paths, File as ExpoFile, downloadAsync } from 'expo-file-system';
import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface AutoProgressResponse {
  status: 'processing' | 'processing_done' | 'complete' | 'error';
  stage: 1 | 2 | 3 | 4;
  stageName: string;
  stageProgress: number;
  overallProgress: number;
  error: string | null;
  outputPath: string | null;
  duration: number | null;
}

/**
 * Upload video using TUS resumable upload protocol
 * Reuses backend TUS endpoint at /api/subtitler/upload (500MB max)
 */
export async function uploadVideo(
  fileUri: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const token = await secureStorage.getToken();

  const fileName = fileUri.split('/').pop() || 'video.mp4';

  const response = await fetch(fileUri);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: `${API_BASE_URL}/subtitler/upload`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      metadata: {
        filename: fileName,
        filetype: 'video/mp4',
        filesize: String(blob.size),
      },
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      onProgress: (bytesUploaded: number, bytesTotal: number) => {
        const percentage = (bytesUploaded / bytesTotal) * 100;
        onProgress(percentage);
      },
      onSuccess: () => {
        const uploadId = upload.url?.split('/').pop();
        if (uploadId) {
          resolve(uploadId);
        } else {
          reject(new Error('Upload succeeded but no upload ID returned'));
        }
      },
      onError: (error: Error) => {
        console.error('[ReelService] TUS upload error:', error);
        reject(error);
      },
    });

    upload.start();
  });
}

/**
 * Start automatic reel processing
 * POST /api/subtitler/process-auto
 */
export async function startAutoProcess(
  uploadId: string,
  userId?: string,
  locale: string = 'de-DE'
): Promise<void> {
  const token = await secureStorage.getToken();

  const response = await fetch(`${API_BASE_URL}/subtitler/process-auto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      uploadId,
      locale,
      userId: userId || null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start auto processing: ${response.status} - ${errorText}`);
  }
}

/**
 * Poll processing progress
 * GET /api/subtitler/auto-progress/:uploadId
 */
export async function getAutoProgress(uploadId: string): Promise<AutoProgressResponse> {
  const token = await secureStorage.getToken();

  const response = await fetch(`${API_BASE_URL}/subtitler/auto-progress/${uploadId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Failed to get progress: ${response.status}`);
  }

  const data: AutoProgressResponse = await response.json();
  return data;
}

/**
 * Download processed video to local cache
 * GET /api/subtitler/auto-download/:uploadId
 * Returns local file URI
 */
export async function downloadVideo(uploadId: string): Promise<string> {
  const token = await secureStorage.getToken();
  const localFile = new ExpoFile(Paths.cache, `reel_${uploadId}.mp4`);

  const downloadResult = await downloadAsync(
    `${API_BASE_URL}/subtitler/auto-download/${uploadId}`,
    localFile.uri,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  if (downloadResult.status !== 200) {
    throw new Error(`Download failed with status: ${downloadResult.status}`);
  }

  return downloadResult.uri;
}

export const reelApi = {
  uploadVideo,
  startAutoProcess,
  getAutoProgress,
  downloadVideo,
};
