import { useCallback, useRef } from 'react';
import { type STTResult, type VoiceAgentConfig } from '../types';
import { float32ToWavBlob } from '../lib/pcmUtils';

export function useSTT(config: VoiceAgentConfig) {
  const abortRef = useRef<AbortController | null>(null);
  const fetchFn = config.fetchFn ?? fetch;

  const transcribe = useCallback(
    async (audio: Float32Array, sampleRate: number): Promise<STTResult> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const wavBlob = float32ToWavBlob(audio, sampleRate);
      const formData = new FormData();
      formData.append('audio', wavBlob, 'recording.wav');

      try {
        const response = await fetchFn(`${config.apiBaseUrl}/api/voice/transcribe`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          return { success: false, error: `STT request failed: ${response.status}` };
        }

        const data = await response.json();
        return data as STTResult;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return { success: false, error: 'Aborted' };
        }
        return { success: false, error: (err as Error).message };
      }
    },
    [config.apiBaseUrl, fetchFn]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { transcribe, abort };
}
