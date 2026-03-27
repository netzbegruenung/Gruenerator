import { useCallback, useRef, useState } from 'react';

const TARGET_SAMPLE_RATE = 16000;

const WORKLET_PROCESSOR_CODE = `
class PCMDownsampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(16384);
    this._writePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    const len = channelData.length;

    if (this._writePos + len > this._buffer.length) {
      const newBuf = new Float32Array(Math.max(this._buffer.length * 2, this._writePos + len));
      newBuf.set(this._buffer.subarray(0, this._writePos));
      this._buffer = newBuf;
    }
    this._buffer.set(channelData, this._writePos);
    this._writePos += len;

    const ratio = sampleRate / ${TARGET_SAMPLE_RATE};
    const targetChunkSize = 480;
    const sourceChunkSize = Math.ceil(targetChunkSize * ratio);
    let readPos = 0;

    while (this._writePos - readPos >= sourceChunkSize) {
      const downsampled = new Int16Array(targetChunkSize);
      for (let i = 0; i < targetChunkSize; i++) {
        const srcIndex = readPos + Math.min(Math.floor(i * ratio), sourceChunkSize - 1);
        const clamped = Math.max(-1, Math.min(1, this._buffer[srcIndex]));
        downsampled[i] = clamped * 0x7fff;
      }
      this.port.postMessage(downsampled.buffer, [downsampled.buffer]);
      readPos += sourceChunkSize;
    }

    if (readPos > 0) {
      const remaining = this._writePos - readPos;
      if (remaining > 0) {
        this._buffer.copyWithin(0, readPos, this._writePos);
      }
      this._writePos = remaining;
    }

    return true;
  }
}

registerProcessor('pcm-downsample-processor', PCMDownsampleProcessor);
`;

export interface UseVoxtralDictationOptions {
  apiBaseUrl?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
}

export function useVoxtralDictation({
  apiBaseUrl = '',
  onTranscript,
}: UseVoxtralDictationOptions = {}) {
  const [isDictating, setIsDictating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const fullTextRef = useRef('');
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stopAudioCapture = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current.port.close();
      workletNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    stopAudioCapture();

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 8000);
        const origHandler = ws.onmessage;
        ws.onmessage = (e) => {
          if (origHandler) (origHandler as (e: MessageEvent) => void)(e);
          try {
            const msg = JSON.parse(e.data as string) as { type: string };
            if (msg.type === 'done') {
              clearTimeout(timeout);
              resolve();
            }
          } catch {
            /* ignore */
          }
        };
      });

      ws.close();
    }
    wsRef.current = null;
    setIsDictating(false);

    const finalText = fullTextRef.current;
    fullTextRef.current = '';
    return finalText;
  }, [stopAudioCapture]);

  const start = useCallback(async () => {
    if (isDictating) return;

    fullTextRef.current = '';
    const protocol = apiBaseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = apiBaseUrl.replace(/^https?:\/\//, '') || window.location.host;
    const wsUrl = `${protocol}://${host}/api/voice/realtime`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as { type: string };
            if (msg.type === 'session.ready') {
              clearTimeout(timeout);
              resolve();
            } else if (msg.type === 'error') {
              clearTimeout(timeout);
              reject(new Error('Session error'));
            }
          } catch {
            /* ignore */
          }
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket failed'));
        };
        ws.onclose = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket closed'));
        };
      });

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { type: string; text?: string };
          if (msg.type === 'text.delta' && msg.text) {
            fullTextRef.current += msg.text;
            onTranscriptRef.current?.(fullTextRef.current, false);
          } else if (msg.type === 'done') {
            onTranscriptRef.current?.(fullTextRef.current, true);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setIsDictating(false);
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: { ideal: TARGET_SAMPLE_RATE }, channelCount: 1 },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pcm-downsample-processor');
      workletNodeRef.current = worklet;

      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };

      source.connect(worklet);
      worklet.connect(ctx.destination);

      setIsDictating(true);
    } catch (err) {
      console.error('[useVoxtralDictation] Setup failed:', err);
      stopAudioCapture();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsDictating(false);
    }
  }, [isDictating, apiBaseUrl, stopAudioCapture]);

  const toggle = useCallback(async () => {
    if (isDictating) return stop();
    await start();
    return '';
  }, [isDictating, start, stop]);

  return { isDictating, start, stop, toggle };
}
