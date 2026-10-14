import { stripForSpeech, useChatConfigStore } from '@gruenerator/chat';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';

export type TTSState = 'idle' | 'loading' | 'playing';

interface TTSChunk {
  audio: string;
  sampleRate: number;
}

function buildWavBytes(allChunks: TTSChunk[]): Uint8Array {
  const sampleRate = allChunks[0]?.sampleRate ?? 24000;
  const allFloat32: Float32Array[] = [];
  let totalSamples = 0;

  for (const chunk of allChunks) {
    const binary = atob(chunk.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const f32 = new Float32Array(bytes.buffer);
    allFloat32.push(f32);
    totalSamples += f32.length;
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = totalSamples * (bitsPerSample / 8);
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let sampleOffset = 0;
  for (const f32 of allFloat32) {
    for (let i = 0; i < f32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, f32[i] ?? 0));
      view.setInt16(headerSize + (sampleOffset + i) * 2, clamped * 0x7fff, true);
    }
    sampleOffset += f32.length;
  }

  return new Uint8Array(buffer);
}

const GERMAN_ABBREVS =
  /(?:z\.B\.|bzw\.|ca\.|d\.h\.|etc\.|evtl\.|ggf\.|o\.ä\.|u\.a\.|u\.U\.|vgl\.|z\.T\.|Nr\.|Dr\.|Prof\.|Mio\.|Mrd\.)/g;

function splitSentences(text: string): string[] {
  const placeholder = '\u0000';
  const safe = text.replace(GERMAN_ABBREVS, (m) => m.replace(/\./g, placeholder));
  return (
    safe
      .split(/(?<=[.!?])\s+/)
      // eslint-disable-next-line no-control-regex
      .map((s) => s.replace(/\u0000/g, '.').trim())
      .filter((s) => s.length > 0)
  );
}

/** Chunks for one sentence; null means stop synthesising the remaining sentences. */
async function fetchSentenceChunks(
  fetchFn: ReturnType<typeof useChatConfigStore.getState>['fetch'],
  url: string,
  sentence: string,
  signal: AbortSignal
): Promise<TTSChunk[] | null> {
  const chunks: TTSChunk[] = [];
  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence, language: 'de' }),
      signal,
    });

    if (!response.ok) return null;

    const responseText = await response.text();
    for (const line of responseText.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6)) as {
          error?: string;
          audio?: string;
          sampleRate?: number;
        };
        if (data.error) break;
        if (data.audio) chunks.push(data as TTSChunk);
      } catch {
        /* ignore malformed SSE lines */
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') return null;
  }
  return chunks;
}

export function useNativeTTS() {
  const [state, setState] = useState<TTSState>('idle');
  const abortRef = useRef<AbortController | null>(null);
  // Created on the first play, not on mount: every assistant row has a
  // read-aloud button, and a native player per row made mounting a row costly.
  const playerRef = useRef<AudioPlayer | null>(null);
  useEffect(
    () => () => {
      // Aborting makes an in-flight `play` return before it creates a player.
      abortRef.current?.abort();
      playerRef.current?.release();
      playerRef.current = null;
    },
    []
  );

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const chatStreamEndpoint = useChatConfigStore((s) => s.endpoints.chatStream);
  const apiBaseUrl = chatStreamEndpoint.replace('/api/chat-graph/stream', '');

  const play = useCallback(
    async (text: string) => {
      if (state !== 'idle') return;

      const stripped = stripForSpeech(text);
      if (!stripped) return;

      setState('loading');
      const controller = new AbortController();
      abortRef.current = controller;

      const sentences = splitSentences(stripped);
      if (sentences.length === 0) {
        setState('idle');
        return;
      }

      const allChunks: TTSChunk[] = [];

      for (const sentence of sentences) {
        if (controller.signal.aborted) break;

        const chunks = await fetchSentenceChunks(
          fetchFn,
          `${apiBaseUrl}/api/voice/tts/stream`,
          sentence,
          controller.signal
        );
        if (!chunks) break;
        allChunks.push(...chunks);
      }
      if (controller.signal.aborted || allChunks.length === 0) {
        setState('idle');
        return;
      }

      const wavBytes = buildWavBytes(allChunks);
      const wavFile = new File(Paths.cache, 'tts-playback.wav');
      wavFile.writeSync(wavBytes);

      if (!playerRef.current) playerRef.current = createAudioPlayer(null);
      playerRef.current.replace({ uri: wavFile.uri });
      playerRef.current.play();
      setState('playing');
    },
    [state, fetchFn, apiBaseUrl]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    playerRef.current?.pause();
    setState('idle');
  }, []);

  return { state, play, stop };
}
