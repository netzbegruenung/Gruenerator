import { useState, useCallback, useRef, useEffect } from 'react';
import apiClient from '../../../components/utils/apiClient';

/**
 * Hook for exporting video with segment cuts
 */
const useSegmentExport = () => {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [exportToken, setExportToken] = useState(null);
  const pollingIntervalRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((token) => {
    stopPolling();

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await apiClient.get(`/subtitler/export-progress/${token}`);
        const data = response.data;

        if (data.status === 'complete') {
          setStatus('complete');
          setProgress(100);
          stopPolling();
        } else if (data.status === 'error') {
          setStatus('error');
          setError(data.error || 'Export fehlgeschlagen');
          stopPolling();
        } else {
          setProgress(data.progress || 0);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  }, [stopPolling]);

  const startExport = useCallback(async (uploadId, segments, options = {}) => {
    setStatus('starting');
    setProgress(0);
    setError(null);
    setExportToken(null);

    try {
      const payload = {
        uploadId,
        projectId: options.projectId,
        segments: segments.map(seg => ({
          start: seg.start,
          end: seg.end
        })),
        includeSubtitles: options.includeSubtitles || false
      };

      if (options.includeSubtitles && options.subtitleConfig) {
        payload.subtitleConfig = {
          segments: options.subtitleConfig.segments,
          stylePreference: options.subtitleConfig.stylePreference || 'standard',
          heightPreference: options.subtitleConfig.heightPreference || 'tief',
          locale: options.subtitleConfig.locale || 'de-DE'
        };
      }

      const response = await apiClient.post('/subtitler/export-segments', payload);

      const { exportToken: token } = response.data;
      setExportToken(token);
      setStatus('exporting');
      startPolling(token);

      return token;
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || err.message || 'Export fehlgeschlagen');
      throw err;
    }
  }, [startPolling]);

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
    isError: status === 'error'
  };
};

export default useSegmentExport;
