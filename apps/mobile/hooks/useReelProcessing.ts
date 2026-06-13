import { useAuthStore } from '@gruenerator/shared/stores';
import * as MediaLibrary from 'expo-media-library';
import { useState, useCallback, useRef, useEffect } from 'react';

import { reelApi } from '../services/reel';
import {
  ensureUploadableSize,
  cancelCompression,
  type CompressionHandle,
} from '../services/videoCompression';
import { getErrorMessage } from '../utils/errors';

export type ReelStatus =
  | 'idle'
  | 'compressing'
  | 'uploading'
  | 'processing'
  | 'downloading'
  | 'complete'
  | 'error'
  | 'transcribing';

export interface ReelProcessingState {
  status: ReelStatus;
  compressionProgress: number;
  uploadProgress: number;
  processingStage: number;
  stageName: string;
  stageProgress: number;
  overallProgress: number;
  downloadProgress: number;
  uploadId: string | null;
  /** Name of the file actually uploaded (matches the X-Filename header). */
  videoFilename: string | null;
  videoUri: string | null;
  savedToGallery: boolean;
  error: string | null;
  errorDetail: string | null;
  transcribedSubtitles: string | null;
}

export const PROCESSING_STAGES = {
  1: { name: 'Video wird analysiert...', icon: 'search-outline' as const },
  2: { name: 'Stille Teile werden entfernt...', icon: 'cut-outline' as const },
  3: { name: 'Untertitel werden grüneriert...', icon: 'text-outline' as const },
  4: { name: 'Wird fertiggestellt...', icon: 'checkmark-circle-outline' as const },
};

export const ERROR_MESSAGES = {
  upload_failed: 'Video konnte nicht hochgeladen werden. Bitte versuche es erneut.',
  file_too_large: 'Video ist zu groß. Maximal 500MB erlaubt.',
  processing_failed: 'Verarbeitung fehlgeschlagen. Bitte versuche es mit einem anderen Video.',
  download_failed: 'Video konnte nicht heruntergeladen werden.',
  save_failed: 'Video konnte nicht in der Galerie gespeichert werden.',
  permission_denied: 'Zugriff auf die Galerie wurde verweigert.',
};

const initialState: ReelProcessingState = {
  status: 'idle',
  compressionProgress: 0,
  uploadProgress: 0,
  processingStage: 1,
  stageName: PROCESSING_STAGES[1].name,
  stageProgress: 0,
  overallProgress: 0,
  downloadProgress: 0,
  uploadId: null,
  videoFilename: null,
  videoUri: null,
  savedToGallery: false,
  error: null,
  errorDetail: null,
  transcribedSubtitles: null,
};

export function useReelProcessing() {
  const [state, setState] = useState<ReelProcessingState>(initialState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const compressionRef = useRef<CompressionHandle | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const { user } = useAuthStore();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const updateState = useCallback((updates: Partial<ReelProcessingState>) => {
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  const reset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setState(initialState);
  }, []);

  const handleError = useCallback(
    (errorKey: keyof typeof ERROR_MESSAGES, details?: string) => {
      console.error(`[ReelProcessing] Error: ${errorKey}`, details);
      updateState({
        status: 'error',
        error: ERROR_MESSAGES[errorKey],
        errorDetail: details ?? null,
      });
    },
    [updateState]
  );

  const saveToGallery = useCallback(
    async (videoUri: string): Promise<boolean> => {
      try {
        // Write-only: we only save to the gallery, never read it (Google Play
        // media-permission policy — avoids requesting READ_MEDIA_IMAGES/VIDEO).
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== 'granted') {
          handleError('permission_denied');
          return false;
        }

        await MediaLibrary.Asset.create(videoUri);
        updateState({ savedToGallery: true });
        return true;
      } catch (error: unknown) {
        console.error('[ReelProcessing] Save to gallery failed:', getErrorMessage(error));
        handleError('save_failed');
        return false;
      }
    },
    [handleError, updateState]
  );

  const pollProgress = useCallback(
    async (uploadId: string) => {
      try {
        const progress = await reelApi.getAutoProgress(uploadId);

        if (!isMountedRef.current) return;

        const stage = progress.stage ?? 1;
        updateState({
          processingStage: stage,
          stageName:
            progress.stageName ||
            PROCESSING_STAGES[stage as keyof typeof PROCESSING_STAGES]?.name ||
            '',
          stageProgress: progress.stageProgress ?? 0,
          overallProgress: progress.overallProgress ?? 0,
        });

        if (progress.status === 'complete') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          updateState({ status: 'downloading', downloadProgress: 0 });

          try {
            const localVideoUri = await reelApi.downloadVideo(uploadId, (percent) => {
              if (isMountedRef.current) {
                updateState({ downloadProgress: percent });
              }
            });

            if (!isMountedRef.current) return;

            updateState({
              status: 'complete',
              videoUri: localVideoUri,
            });

            await saveToGallery(localVideoUri);
          } catch (downloadError: unknown) {
            handleError('download_failed', getErrorMessage(downloadError));
          }
        } else if (progress.status === 'error') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          handleError('processing_failed', progress.error || undefined);
        }
      } catch (error: unknown) {
        console.error('[ReelProcessing] Polling error:', getErrorMessage(error));
      }
    },
    [handleError, saveToGallery, updateState]
  );

  const startPolling = useCallback(
    (uploadId: string) => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }

      void pollProgress(uploadId);

      pollingRef.current = setInterval(() => {
        void pollProgress(uploadId);
      }, 2000);
    },
    [pollProgress]
  );

  /**
   * Compress oversized videos before upload (see services/videoCompression).
   * Returns the uri to upload, or null when the user cancelled meanwhile.
   * Compression is best-effort: on failure the original file is uploaded and
   * the server-side size limits decide.
   */
  const compressForUpload = useCallback(
    async (fileUri: string, signal: AbortSignal): Promise<string | null> => {
      const handle: CompressionHandle = { cancellationId: null };
      compressionRef.current = handle;
      updateState({ status: 'compressing', compressionProgress: 0 });
      try {
        const uri = await ensureUploadableSize(
          fileUri,
          (percent) => {
            if (isMountedRef.current) {
              updateState({ compressionProgress: percent });
            }
          },
          handle
        );
        return signal.aborted ? null : uri;
      } catch (error: unknown) {
        if (signal.aborted) return null;
        console.warn(
          '[ReelProcessing] Compression failed, uploading original:',
          getErrorMessage(error)
        );
        return fileUri;
      } finally {
        compressionRef.current = null;
      }
    },
    [updateState]
  );

  const startProcessing = useCallback(
    async (fileUri: string) => {
      reset();
      uploadIdRef.current = null;
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      try {
        const uploadUri = await compressForUpload(fileUri, controller.signal);
        if (uploadUri == null || !isMountedRef.current) return;
        updateState({ status: 'uploading' });

        const uploadId = await reelApi.uploadVideo(
          uploadUri,
          (progress) => {
            if (isMountedRef.current) {
              updateState({ uploadProgress: progress });
            }
          },
          controller.signal
        );

        if (!isMountedRef.current) return;
        uploadIdRef.current = uploadId;

        updateState({
          status: 'processing',
          uploadId,
          videoFilename: uploadUri.split('/').pop() || 'video.mp4',
          uploadProgress: 100,
        });

        await reelApi.startAutoProcess(uploadId, user?.id);

        startPolling(uploadId);
      } catch (error: unknown) {
        // cancelProcessing aborts the signal and already reset state — stay quiet.
        if (controller.signal.aborted) return;
        console.error('[ReelProcessing] Start processing error:', getErrorMessage(error));
        handleError('upload_failed', getErrorMessage(error));
      }
    },
    [compressForUpload, handleError, reset, startPolling, updateState, user]
  );

  const cancelProcessing = useCallback(() => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    if (compressionRef.current) {
      cancelCompression(compressionRef.current);
      compressionRef.current = null;
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    const uploadId = uploadIdRef.current;
    if (uploadId) {
      void reelApi.cancelUpload(uploadId);
      uploadIdRef.current = null;
    }
    reset();
  }, [reset]);

  const pollManualResult = useCallback(
    async (uploadId: string) => {
      try {
        const result = await reelApi.getManualResult(uploadId);

        if (!isMountedRef.current) return;

        if (result.status === 'complete' && result.data) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          updateState({
            status: 'complete',
            transcribedSubtitles: result.data,
          });
        } else if (result.status === 'error') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          handleError('processing_failed');
        }
      } catch (error: unknown) {
        console.error('[ReelProcessing] Manual polling error:', getErrorMessage(error));
      }
    },
    [handleError, updateState]
  );

  const startManualPolling = useCallback(
    (uploadId: string) => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }

      void pollManualResult(uploadId);

      pollingRef.current = setInterval(() => {
        void pollManualResult(uploadId);
      }, 2000);
    },
    [pollManualResult]
  );

  const startManualProcessing = useCallback(
    async (fileUri: string) => {
      reset();
      uploadIdRef.current = null;
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      try {
        const uploadUri = await compressForUpload(fileUri, controller.signal);
        if (uploadUri == null || !isMountedRef.current) return;
        updateState({ status: 'uploading' });

        const uploadId = await reelApi.uploadVideo(
          uploadUri,
          (progress) => {
            if (isMountedRef.current) {
              updateState({ uploadProgress: progress });
            }
          },
          controller.signal
        );

        if (!isMountedRef.current) return;
        uploadIdRef.current = uploadId;

        updateState({
          status: 'transcribing',
          uploadId,
          videoFilename: uploadUri.split('/').pop() || 'video.mp4',
          uploadProgress: 100,
          stageName: 'Untertitel werden grüneriert...',
        });

        await reelApi.startManualProcess(uploadId);

        startManualPolling(uploadId);
      } catch (error: unknown) {
        // cancelProcessing aborts the signal and already reset state — stay quiet.
        if (controller.signal.aborted) return;
        console.error('[ReelProcessing] Start manual processing error:', getErrorMessage(error));
        handleError('upload_failed', getErrorMessage(error));
      }
    },
    [compressForUpload, handleError, reset, startManualPolling, updateState]
  );

  return {
    ...state,
    startProcessing,
    startManualProcessing,
    cancelProcessing,
    reset,
    saveToGallery,
  };
}
