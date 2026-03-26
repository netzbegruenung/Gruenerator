/**
 * Web Audio API PCM chunk queue player.
 *
 * Receives base64-encoded float32 LE PCM chunks from Voxtral TTS and plays
 * them gaplessly using AudioBufferSourceNode scheduling. Each chunk is
 * scheduled to start exactly when the previous one ends.
 */

import { useCallback, useRef } from 'react';
import { base64Float32LEToFloat32 } from '../lib/pcmUtils';

export function useAudioPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const playingRef = useRef(false);
  const onPlaybackEndRef = useRef<(() => void) | null>(null);
  const pendingCountRef = useRef(0);
  const doneSignaledRef = useRef(false);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const enqueue = useCallback(
    (pcmBase64: string, sampleRate: number) => {
      const ctx = ensureContext();
      const float32 = base64Float32LEToFloat32(pcmBase64);

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(nextStartTimeRef.current, now);
      source.start(startTime);

      nextStartTimeRef.current = startTime + audioBuffer.duration;
      activeNodesRef.current.push(source);
      playingRef.current = true;
      pendingCountRef.current++;

      source.onended = () => {
        pendingCountRef.current--;
        activeNodesRef.current = activeNodesRef.current.filter((n) => n !== source);

        if (pendingCountRef.current <= 0 && doneSignaledRef.current) {
          playingRef.current = false;
          doneSignaledRef.current = false;
          onPlaybackEndRef.current?.();
        }
      };
    },
    [ensureContext]
  );

  const signalDone = useCallback(() => {
    doneSignaledRef.current = true;
    if (pendingCountRef.current <= 0) {
      playingRef.current = false;
      doneSignaledRef.current = false;
      onPlaybackEndRef.current?.();
    }
  }, []);

  const stop = useCallback(() => {
    for (const node of activeNodesRef.current) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    activeNodesRef.current = [];
    pendingCountRef.current = 0;
    nextStartTimeRef.current = 0;
    playingRef.current = false;
    doneSignaledRef.current = false;
  }, []);

  const isPlaying = useCallback(() => playingRef.current, []);

  const setOnPlaybackEnd = useCallback((cb: (() => void) | null) => {
    onPlaybackEndRef.current = cb;
  }, []);

  return { enqueue, stop, isPlaying, signalDone, setOnPlaybackEnd, ensureContext };
}
