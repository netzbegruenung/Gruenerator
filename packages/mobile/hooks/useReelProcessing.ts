import { useState, useCallback, useRef, useEffect } from 'react';
import * as MediaLibrary from 'expo-media-library';
import { reelApi, AutoProgressResponse } from '../services/reel';
import { useAuthStore } from '@gruenerator/shared/stores';
import { getErrorMessage } from '../utils/errors';

export type ReelStatus = 'idle' | 'uploading' | 'processing' | 'downloading' | 'complete' | 'error';

export interface ReelProcessingState {
  status: ReelStatus;
  uploadProgress: number;
  processingStage: 1 | 2 | 3 | 4;
  stageName: string;
  stageProgress: number;
  overallProgress: number;
  uploadId: string | null;
  videoUri: string | null;
  savedToGallery: boolean;
  error: string | null;
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
  uploadProgress: 0,
  processingStage: 1,
  stageName: PROCESSING_STAGES[1].name,
  stageProgress: 0,
  overallProgress: 0,
  uploadId: null,
  videoUri: null,
  savedToGallery: false,
  error: null,
};

export function useReelProcessing() {
  const [state, setState] = useState<ReelProcessingState>(initialState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const reset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setState(initialState);
  }, []);

  const handleError = useCallback((errorKey: keyof typeof ERROR_MESSAGES, details?: string) => {
    console.error(`[ReelProcessing] Error: ${errorKey}`, details);
    updateState({
      status: 'error',
      error: ERROR_MESSAGES[errorKey],
    });
  }, [updateState]);

  const saveToGallery = useCallback(async (videoUri: string): Promise<boolean> => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        handleError('permission_denied');
        return false;
      }

      await MediaLibrary.saveToLibraryAsync(videoUri);
      updateState({ savedToGallery: true });
      return true;
    } catch (error: unknown) {
      console.error('[ReelProcessing] Save to gallery failed:', getErrorMessage(error));
      handleError('save_failed');
      return false;
    }
  }, [handleError, updateState]);

  const pollProgress = useCallback(async (uploadId: string) => {
    try {
      const progress = await reelApi.getAutoProgress(uploadId);

      if (!isMountedRef.current) return;

      updateState({
        processingStage: progress.stage,
        stageName: progress.stageName || PROCESSING_STAGES[progress.stage]?.name || '',
        stageProgress: progress.stageProgress,
        overallProgress: progress.overallProgress,
      });

      if (progress.status === 'complete') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        updateState({ status: 'downloading' });

        try {
          const localVideoUri = await reelApi.downloadVideo(uploadId);

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
  }, [handleError, saveToGallery, updateState]);

  const startPolling = useCallback((uploadId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollProgress(uploadId);

    pollingRef.current = setInterval(() => {
      pollProgress(uploadId);
    }, 2000);
  }, [pollProgress]);

  const startProcessing = useCallback(async (fileUri: string) => {
    reset();
    updateState({ status: 'uploading' });

    try {
      const uploadId = await reelApi.uploadVideo(fileUri, (progress) => {
        if (isMountedRef.current) {
          updateState({ uploadProgress: progress });
        }
      });

      if (!isMountedRef.current) return;

      updateState({
        status: 'processing',
        uploadId,
        uploadProgress: 100,
      });

      await reelApi.startAutoProcess(uploadId, user?.id);

      startPolling(uploadId);
    } catch (error: unknown) {
      console.error('[ReelProcessing] Start processing error:', getErrorMessage(error));
      handleError('upload_failed', getErrorMessage(error));
    }
  }, [handleError, reset, startPolling, updateState, user?.id]);

  const cancelProcessing = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    reset();
  }, [reset]);

  return {
    ...state,
    startProcessing,
    cancelProcessing,
    reset,
    saveToGallery,
  };
}
