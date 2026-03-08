import { useCallback, useRef } from 'react';
import { type TTSChunk, type VoiceAgentConfig } from '../types';

interface TTSStreamCallbacks {
  onChunk: (chunk: TTSChunk) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export function useTTSStream(config: VoiceAgentConfig) {
  const abortRef = useRef<AbortController | null>(null);
  const fetchFn = config.fetchFn ?? fetch;

  const streamSentence = useCallback(
    async (text: string, callbacks: TTSStreamCallbacks) => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetchFn(`${config.apiBaseUrl}/api/voice/tts/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: config.ttsVoiceId,
            cfgScale: config.ttsCfgScale ?? 2.0,
            language: 'de',
          }),
          signal: controller.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          callbacks.onError(`TTS request failed: ${response.status}`);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          callbacks.onError('No response body');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                if (data.audio) {
                  callbacks.onChunk(data as TTSChunk);
                }
              } catch {
                // skip non-JSON lines
              }
            }
          }
        }

        callbacks.onDone();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        callbacks.onError((err as Error).message);
      }
    },
    [config.apiBaseUrl, config.ttsVoiceId, config.ttsCfgScale, fetchFn]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { streamSentence, abort };
}
