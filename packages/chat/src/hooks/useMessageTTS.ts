import {
  useTTSStream,
  useAudioPlayback,
  splitSentences,
  type VoiceAgentConfig,
} from '@gruenerator/voice';
import { useCallback, useRef, useState } from 'react';

import { stripForSpeech } from '../lib/speechText';

export type TTSState = 'idle' | 'loading' | 'playing';

interface UseMessageTTSOptions {
  apiBaseUrl: string;
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>;
  voiceId?: string;
}

export function useMessageTTS({ apiBaseUrl, fetchFn, voiceId }: UseMessageTTSOptions) {
  const [state, setState] = useState<TTSState>('idle');
  const stateRef = useRef<TTSState>('idle');
  const abortedRef = useRef(false);

  const config: VoiceAgentConfig = {
    apiBaseUrl,
    fetchFn: fetchFn as typeof fetch | undefined,
    ttsVoiceId: voiceId,
  };

  const { streamSentence, abort: abortStream } = useTTSStream(config);
  const { enqueue, stop: stopPlayback, signalDone, setOnPlaybackEnd } = useAudioPlayback();

  const updateState = useCallback((next: TTSState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const play = useCallback(
    async (text: string) => {
      if (stateRef.current !== 'idle') return;

      abortedRef.current = false;
      updateState('loading');

      const { complete, remainder } = splitSentences(stripForSpeech(text));
      const sentences = [...complete];
      if (remainder.trim()) sentences.push(remainder.trim());

      if (sentences.length === 0) {
        updateState('idle');
        return;
      }

      setOnPlaybackEnd(() => {
        updateState('idle');
      });

      let firstChunk = true;
      let hadError = false;

      for (const sentence of sentences) {
        if (abortedRef.current || hadError) break;

        await streamSentence(sentence, {
          onChunk: (chunk) => {
            if (abortedRef.current) return;
            if (firstChunk) {
              updateState('playing');
              firstChunk = false;
            }
            enqueue(chunk.audio, chunk.sampleRate);
          },
          onDone: () => {},
          onError: (err) => {
            hadError = true;
            if (!abortedRef.current) {
              console.warn('[TTS] Vorlesen fehlgeschlagen:', err);
            }
          },
        });
      }

      if (hadError) {
        stopPlayback();
        updateState('idle');
      } else if (!abortedRef.current) {
        signalDone();
      }
    },
    [streamSentence, enqueue, stopPlayback, signalDone, setOnPlaybackEnd, updateState]
  );

  const stop = useCallback(() => {
    abortedRef.current = true;
    abortStream();
    stopPlayback();
    updateState('idle');
  }, [abortStream, stopPlayback, updateState]);

  return { state, play, stop };
}
