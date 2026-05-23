import { type AutoProgress, type ExportProgress } from '@gruenerator/contracts';
import { Paths, File as ExpoFile } from 'expo-file-system';
import * as tus from 'tus-js-client';

import { secureStorage } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export type AutoProgressResponse = AutoProgress;

export interface ManualResultResponse {
  status: 'processing' | 'complete' | 'error';
  data: string | null;
}

/** Read a local `file://` URI into a file-backed Blob via XHR (see uploadVideo note). */
function readLocalFileAsBlob(uri: string, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error(`Failed to read local file: ${uri}`));
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
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

  // Read the local file via XMLHttpRequest, not fetch: SDK 56 makes the global
  // `fetch` use expo/fetch, which is http(s)-only and rejects `file://` URIs.
  // XHR still handles file:// and returns a file-backed Blob (no full-file heap
  // copy), which matters for videos up to the 500MB backend cap.
  const blob = await readLocalFileAsBlob(fileUri, 'video/mp4');

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

  const data = (await response.json()) as AutoProgressResponse;
  return data;
}

/**
 * Download processed video to local cache
 * GET /api/subtitler/auto-download/:uploadId
 * Returns local file URI
 */
export async function downloadVideo(uploadId: string): Promise<string> {
  const token = await secureStorage.getToken();
  const destination = new ExpoFile(Paths.cache, `reel_${uploadId}.mp4`);

  const file = await ExpoFile.downloadFileAsync(
    `${API_BASE_URL}/subtitler/auto-download/${uploadId}`,
    destination,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      idempotent: true,
    }
  );

  return file.uri;
}

/**
 * Start manual subtitle processing (transcription only, no silence removal)
 * POST /api/subtitler/process
 */
export async function startManualProcess(
  uploadId: string,
  stylePreference: string = 'shadow',
  heightPreference: string = 'tief'
): Promise<void> {
  const token = await secureStorage.getToken();

  const response = await fetch(`${API_BASE_URL}/subtitler/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      uploadId,
      subtitlePreference: 'manual',
      stylePreference,
      heightPreference,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start manual processing: ${response.status} - ${errorText}`);
  }
}

/**
 * Poll manual processing result
 * GET /api/subtitler/result/:uploadId
 */
export async function getManualResult(
  uploadId: string,
  stylePreference: string = 'shadow',
  heightPreference: string = 'tief'
): Promise<ManualResultResponse> {
  const token = await secureStorage.getToken();

  const params = new URLSearchParams({
    subtitlePreference: 'manual',
    stylePreference,
    heightPreference,
  });

  const response = await fetch(`${API_BASE_URL}/subtitler/result/${uploadId}?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Failed to get manual result: ${response.status}`);
  }

  interface ManualResultRaw {
    status: ManualResultResponse['status'];
    subtitles?: string | null;
    data?: string | null;
  }
  const responseData = (await response.json()) as ManualResultRaw;
  return {
    status: responseData.status,
    data: responseData.subtitles ?? responseData.data ?? null,
  };
}

export type ExportProgressResponse = ExportProgress;

/**
 * Start video export with burned-in subtitles
 * POST /api/subtitler/export
 * Returns exportToken for polling progress
 */
export async function exportVideo(params: {
  uploadId: string | null;
  projectId: string | null;
  userId: string | null;
  subtitles: { startTime: number; endTime: number; text: string }[];
  stylePreference: string;
  heightPreference: string;
}): Promise<string> {
  const token = await secureStorage.getToken();

  const response = await fetch(`${API_BASE_URL}/subtitler/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      ...(params.uploadId ? { uploadId: params.uploadId } : {}),
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      subtitles: params.subtitles,
      stylePreference: params.stylePreference,
      heightPreference: params.heightPreference,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export fehlgeschlagen: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { exportToken: string };
  return data.exportToken;
}

/**
 * Poll export progress
 * GET /api/subtitler/export-progress/:exportToken
 */
export async function pollExportProgress(exportToken: string): Promise<ExportProgressResponse> {
  const response = await fetch(`${API_BASE_URL}/subtitler/export-progress/${exportToken}`);

  if (!response.ok) {
    throw new Error(`Export-Fortschritt konnte nicht abgerufen werden: ${response.status}`);
  }

  return (await response.json()) as ExportProgressResponse;
}

/**
 * Download exported video to local cache
 * GET /api/subtitler/export-download/:exportToken
 */
export async function downloadExportedVideo(exportToken: string): Promise<string> {
  const destination = new ExpoFile(Paths.cache, `export_${exportToken}.mp4`);

  const file = await ExpoFile.downloadFileAsync(
    `${API_BASE_URL}/subtitler/export-download/${exportToken}`,
    destination,
    { idempotent: true }
  );

  return file.uri;
}

export const reelApi = {
  uploadVideo,
  startAutoProcess,
  getAutoProgress,
  downloadVideo,
  startManualProcess,
  getManualResult,
  exportVideo,
  pollExportProgress,
  downloadExportedVideo,
};
