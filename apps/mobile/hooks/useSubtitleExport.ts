import { useState, useCallback, useRef, useEffect } from 'react';

import { reelApi } from '../services/reel';
import { useSubtitleEditorStore } from '../stores/subtitleEditorStore';

import type { ExportProgressResponse } from '../services/reel';

export type ExportStatus = 'idle' | 'saving' | 'exporting' | 'downloading' | 'complete' | 'error';

interface ExportState {
  status: ExportStatus;
  progress: number;
  videoUri: string | null;
  error: string | null;
}

const initialState: ExportState = {
  status: 'idle',
  progress: 0,
  videoUri: null,
  error: null,
};

export function useSubtitleExport(saveChanges: () => Promise<boolean>) {
  const [state, setState] = useState<ExportState>(initialState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setState(initialState);
  }, []);

  const startExport = useCallback(async () => {
    reset();
    setState({ ...initialState, status: 'saving' });

    const saved = await saveChanges();
    if (!saved) {
      if (isMountedRef.current) {
        setState({ ...initialState, status: 'error', error: 'Speichern fehlgeschlagen' });
      }
      return;
    }

    if (!isMountedRef.current) return;

    const { uploadId, segments, stylePreference, heightPreference } =
      useSubtitleEditorStore.getState();

    if (!uploadId || segments.length === 0) {
      setState({
        ...initialState,
        status: 'error',
        error: 'Keine Untertitel zum Exportieren vorhanden',
      });
      return;
    }

    setState((prev) => ({ ...prev, status: 'exporting', progress: 0 }));

    try {
      const subtitleData = segments.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
      }));

      const exportToken = await reelApi.exportVideo({
        uploadId,
        subtitles: subtitleData,
        stylePreference,
        heightPreference,
      });

      if (!isMountedRef.current) return;

      const pollFn = async () => {
        try {
          const progressData: ExportProgressResponse =
            await reelApi.pollExportProgress(exportToken);

          if (!isMountedRef.current) return;

          if (progressData.status === 'exporting') {
            setState((prev) => ({ ...prev, progress: progressData.progress ?? 0 }));
          } else if (progressData.status === 'complete') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }

            setState((prev) => ({ ...prev, status: 'downloading', progress: 100 }));

            try {
              const videoUri = await reelApi.downloadExportedVideo(exportToken);
              if (isMountedRef.current) {
                setState({ status: 'complete', progress: 100, videoUri, error: null });
              }
            } catch (downloadErr) {
              if (isMountedRef.current) {
                setState({
                  status: 'error',
                  progress: 0,
                  videoUri: null,
                  error: 'Download fehlgeschlagen',
                });
              }
            }
          } else if (progressData.status === 'error') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            if (isMountedRef.current) {
              setState({
                status: 'error',
                progress: 0,
                videoUri: null,
                error: progressData.error || 'Export fehlgeschlagen',
              });
            }
          }
        } catch {
          // Polling errors are transient — keep trying
        }
      };

      pollFn();
      pollingRef.current = setInterval(pollFn, 2000);
    } catch (err) {
      if (isMountedRef.current) {
        setState({
          status: 'error',
          progress: 0,
          videoUri: null,
          error: err instanceof Error ? err.message : 'Export fehlgeschlagen',
        });
      }
    }
  }, [saveChanges, reset]);

  return {
    ...state,
    startExport,
    reset,
  };
}
