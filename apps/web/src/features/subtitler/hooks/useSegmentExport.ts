import { getContractsClient } from '@gruenerator/shared/api';
import { useState, useCallback, useRef, useEffect } from 'react';

import apiClient from '../../../components/utils/apiClient';

interface Segment {
  start: number;
  end: number;
}

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

interface SubtitleConfig {
  segments: SubtitleSegment[];
  stylePreference?: string;
  heightPreference?: string;
  locale?: string;
}

interface ExportOptions {
  projectId?: string;
  includeSubtitles?: boolean;
  subtitleConfig?: SubtitleConfig;
}

type ExportStatus = 'idle' | 'starting' | 'exporting' | 'complete' | 'error';

/**
 * Hook for exporting video with segment cuts
 */
const useSegmentExport = () => {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [exportToken, setExportToken] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (token: string) => {
      stopPolling();

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const res = await getContractsClient().subtitler.getExportProgress({
            params: { exportToken: token },
          });
          if (res.status !== 200) {
            throw new Error((res.body as { error?: string })?.error ?? 'Export progress not found');
          }
          const data = res.body;

          if (data.status === 'complete') {
            setStatus('complete');
            setProgress(100);
            stopPolling();
          } else if (data.status === 'error') {
            setStatus('error');
            setError(data.error ?? 'Export fehlgeschlagen');
            stopPolling();
          } else {
            setProgress(data.progress ?? 0);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 2000);
    },
    [stopPolling]
  );

  const startExport = useCallback(
    async (uploadId: string, segments: Segment[], options: ExportOptions = {}) => {
      setStatus('starting');
      setProgress(0);
      setError(null);
      setExportToken(null);

      try {
        const res = await getContractsClient().subtitler.postExportSegments({
          body: {
            uploadId,
            ...(options.projectId != null && { projectId: options.projectId }),
            segments: segments.map((seg) => ({ start: seg.start, end: seg.end })),
            includeSubtitles: options.includeSubtitles || false,
            ...(options.includeSubtitles &&
              options.subtitleConfig && {
                subtitleConfig: {
                  // The contract + segmentExportService consume `startTime`/
                  // `endTime`; this hook holds `{start,end,text}`, so map — do
                  // not cast (a cast would send undefined start/end times).
                  segments: options.subtitleConfig.segments.map((s) => ({
                    text: s.text,
                    startTime: s.start,
                    endTime: s.end,
                  })),
                  stylePreference: options.subtitleConfig.stylePreference || 'standard',
                  heightPreference: options.subtitleConfig.heightPreference || 'tief',
                  locale: options.subtitleConfig.locale || 'de-DE',
                },
              }),
          },
        });

        if (res.status !== 202) {
          throw new Error((res.body as { error?: string })?.error ?? 'Export fehlgeschlagen');
        }

        const token = res.body.exportToken;
        setExportToken(token);
        setStatus('exporting');
        startPolling(token);

        return token;
      } catch (err: unknown) {
        setStatus('error');
        const axiosError = err as { response?: { data?: { error?: string } }; message?: string };
        setError(axiosError.response?.data?.error || axiosError.message || 'Export fehlgeschlagen');
        throw err;
      }
    },
    [startPolling]
  );

  const downloadExport = useCallback(async () => {
    if (!exportToken || status !== 'complete') {
      return;
    }

    try {
      const downloadUrl = `/subtitler/export-download/${exportToken}`;
      const link = document.createElement('a');
      link.href = `${apiClient.defaults.baseURL}${downloadUrl}`;
      link.download = `video_cut_${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      setError('Download fehlgeschlagen');
    }
  }, [exportToken, status]);

  const reset = useCallback(() => {
    stopPolling();
    setStatus('idle');
    setProgress(0);
    setError(null);
    setExportToken(null);
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    progress,
    error,
    exportToken,
    startExport,
    downloadExport,
    reset,
    isExporting: status === 'starting' || status === 'exporting',
    isComplete: status === 'complete',
    isError: status === 'error',
  };
};

export default useSegmentExport;
