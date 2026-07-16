import { type AutoProgress, type ExportProgress } from '@gruenerator/contracts';
import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { Paths, File as ExpoFile, DownloadTask, UploadType } from 'expo-file-system';

import { secureStorage } from './storage';

/**
 * Base URL for the binary upload/download routes (native uploader / DownloadTask
 * need a full URL). Read from the SAME global axios client the contract client
 * uses so JSON and binary calls always hit the same host — otherwise an uploadId
 * created against one host would 404 on the other. Falls back to the env value.
 */
function binaryBaseUrl(): string {
  return (
    getGlobalApiClient().defaults.baseURL ||
    process.env.EXPO_PUBLIC_API_URL ||
    'https://gruenerator.eu/api'
  );
}

/**
 * Short, human-readable message from an error response body. API errors are
 * JSON (`{ error }`); infrastructure errors (nginx) are whole HTML pages,
 * which must never reach the UI — fall back to the status code instead.
 */
function serverErrorMessage(status: number, body: string | null): string {
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // not JSON (e.g. nginx HTML error page)
    }
  }
  return `HTTP ${status}`;
}

/** Error message from a ts-rest contract response body. */
function contractErrorMessage(status: number, body: unknown): string {
  const b = body as { error?: string } | null;
  return b?.error ?? `HTTP ${status}`;
}

export type AutoProgressResponse = AutoProgress;

export interface ManualResultResponse {
  status: 'processing' | 'complete' | 'error';
  data: string | null;
}

/**
 * Upload a video to the backend's plain-binary endpoint (POST /subtitler/upload-binary),
 * which writes it to the same tus-temp store the processing pipeline reads.
 *
 * Uses expo-file-system's native uploader rather than a JS upload library: it
 * streams the file straight from disk to the socket on the native side. This
 * sidesteps the React-Native traps that broke the old tus-client path under
 * SDK 56 — reading `file://` via XMLHttpRequest fails on the new architecture,
 * `File.slice()` loads the whole file into the JS heap (OOM on large videos),
 * and accumulating stream chunks in JS is quadratic. Native streaming has none
 * of those costs and no base64 inflation. Pass `signal` to cancel mid-upload.
 *
 * Binary upload — stays on the native uploader, not the JSON contract client.
 */
export async function uploadVideo(
  fileUri: string,
  onProgress: (progress: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const token = await secureStorage.getToken();
  const fileName = fileUri.split('/').pop() || 'video.mp4';

  const file = new ExpoFile(fileUri);
  const task = file.createUploadTask(`${binaryBaseUrl()}/subtitler/upload-binary`, {
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'video/mp4',
      'X-Filename': fileName,
    },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) {
        onProgress((bytesSent / totalBytes) * 100);
      }
    },
    ...(signal ? { signal } : {}),
  });

  const result = await task.uploadAsync();
  if (result.status === 413) {
    throw new Error('Video ist zu groß. Maximal 500MB erlaubt.');
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload fehlgeschlagen: ${serverErrorMessage(result.status, result.body)}`);
  }

  const parsed = JSON.parse(result.body) as { uploadId?: string };
  if (!parsed.uploadId) {
    throw new Error('Upload succeeded but no upload ID returned');
  }
  return parsed.uploadId;
}

/**
 * Cancel an upload/processing job: tells the backend to flag it cancelled and
 * clean up its temp files. POST /api/subtitler/cleanup/:uploadId. Best-effort —
 * the local abort is what stops the in-flight transfer; this frees server state.
 */
export async function cancelUpload(uploadId: string): Promise<void> {
  await getContractsClient()
    .subtitler.postCleanup({ params: { uploadId } })
    .catch(() => {});
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
  const res = await getContractsClient().subtitler.postProcessAuto({
    body: { uploadId, locale, userId: userId || null },
  });
  if (res.status !== 202) {
    throw new Error(
      `Verarbeitung konnte nicht gestartet werden: ${contractErrorMessage(res.status, res.body)}`
    );
  }
}

/**
 * Poll processing progress
 * GET /api/subtitler/auto-progress/:uploadId
 */
export async function getAutoProgress(uploadId: string): Promise<AutoProgressResponse> {
  const res = await getContractsClient().subtitler.getAutoProgress({ params: { uploadId } });
  if (res.status !== 200) {
    throw new Error(`Failed to get progress: ${res.status}`);
  }
  return res.body;
}

/**
 * Download processed video to local cache
 * GET /api/subtitler/auto-download/:uploadId
 * Returns local file URI
 *
 * Binary download — stays on the native download task, not the JSON contract client.
 */
export async function downloadVideo(
  uploadId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const token = await secureStorage.getToken();
  const destination = new ExpoFile(Paths.cache, `reel_${uploadId}.mp4`);

  // DownloadTask rejects if the destination already exists (no idempotent flag);
  // clear a stale cache file from a previous attempt first.
  if (destination.exists) {
    destination.delete();
  }

  // Use the resumable DownloadTask (SDK 56) instead of the fire-and-forget
  // File.downloadFileAsync so we can report progress for these large reel videos.
  const task = new DownloadTask(
    `${binaryBaseUrl()}/subtitler/auto-download/${uploadId}`,
    destination,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      onProgress: onProgress
        ? ({ bytesWritten, totalBytes }) => {
            if (totalBytes > 0) {
              onProgress(Math.min(100, Math.round((bytesWritten / totalBytes) * 100)));
            }
          }
        : undefined,
    }
  );

  const file = await task.downloadAsync();
  if (!file) {
    throw new Error('Download was interrupted');
  }
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
  const res = await getContractsClient().subtitler.postProcess({
    body: {
      uploadId,
      subtitlePreference: 'manual',
      stylePreference,
      heightPreference: heightPreference as 'standard' | 'tief',
    },
  });
  if (res.status !== 202) {
    throw new Error(
      `Transkription konnte nicht gestartet werden: ${contractErrorMessage(res.status, res.body)}`
    );
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
  const res = await getContractsClient().subtitler.getResult({
    params: { uploadId },
    query: { subtitlePreference: 'manual', stylePreference, heightPreference },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to get manual result: ${res.status}`);
  }

  const subtitles = res.body.subtitles;
  return {
    status: res.body.status as ManualResultResponse['status'],
    data: typeof subtitles === 'string' ? subtitles : null,
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
  const res = await getContractsClient().subtitler.postExport({
    body: {
      ...(params.uploadId ? { uploadId: params.uploadId } : {}),
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      subtitles: params.subtitles as Record<string, unknown>[],
      stylePreference: params.stylePreference,
      heightPreference: params.heightPreference,
    },
  });

  if (res.status !== 202) {
    throw new Error(`Export fehlgeschlagen: ${contractErrorMessage(res.status, res.body)}`);
  }
  return res.body.exportToken;
}

/**
 * Poll export progress
 * GET /api/subtitler/export-progress/:exportToken
 */
export async function pollExportProgress(exportToken: string): Promise<ExportProgressResponse> {
  const res = await getContractsClient().subtitler.getExportProgress({ params: { exportToken } });
  if (res.status !== 200) {
    throw new Error(`Export-Fortschritt konnte nicht abgerufen werden: ${res.status}`);
  }
  return res.body;
}

/**
 * Download exported video to local cache
 * GET /api/subtitler/export-download/:exportToken
 *
 * Binary download — stays on the native download helper, not the JSON contract client.
 */
export async function downloadExportedVideo(exportToken: string): Promise<string> {
  const destination = new ExpoFile(Paths.cache, `export_${exportToken}.mp4`);

  const file = await ExpoFile.downloadFileAsync(
    `${binaryBaseUrl()}/subtitler/export-download/${exportToken}`,
    destination,
    { idempotent: true }
  );

  return file.uri;
}

export const reelApi = {
  uploadVideo,
  cancelUpload,
  startAutoProcess,
  getAutoProgress,
  downloadVideo,
  startManualProcess,
  getManualResult,
  exportVideo,
  pollExportProgress,
  downloadExportedVideo,
};
