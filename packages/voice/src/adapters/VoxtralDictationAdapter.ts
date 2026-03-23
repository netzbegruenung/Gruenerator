import { type DictationAdapter } from '@assistant-ui/react';

type Unsubscribe = () => void;

const TARGET_SAMPLE_RATE = 16000;
const INACTIVITY_TIMEOUT_MS = 30_000;

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

interface VoxtralDictationConfig {
  apiBaseUrl?: string;
  language?: string;
}

export class VoxtralDictationAdapter implements DictationAdapter {
  private _wsUrl: string;

  constructor(config: VoxtralDictationConfig = {}) {
    const base = config.apiBaseUrl ?? '';
    const protocol = base.startsWith('https') ? 'wss' : 'ws';
    const host = base.replace(/^https?:\/\//, '') || window.location.host;
    this._wsUrl = `${protocol}://${host}/api/voice/realtime`;
  }

  listen(): DictationAdapter.Session {
    const speechStartCallbacks = new Set<() => void>();
    const speechEndCallbacks = new Set<(result: DictationAdapter.Result) => void>();
    const speechCallbacks = new Set<(result: DictationAdapter.Result) => void>();

    let ws: WebSocket | null = null;
    let audioContext: AudioContext | null = null;
    let mediaStream: MediaStream | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let stopping = false;
    let fullText = '';
    let doneResolve: (() => void) | null = null;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (stopping) return;
      inactivityTimer = setTimeout(() => {
        stopping = true;
        stopAudioCapture();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop' }));
        }
      }, INACTIVITY_TIMEOUT_MS);
    };

    const clearInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };

    const session: DictationAdapter.Session = {
      status: { type: 'starting' },

      stop: async () => {
        if (stopping || session.status.type === 'ended') return;
        stopping = true;
        clearInactivityTimer();
        stopAudioCapture();

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop' }));

          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 8000);
            doneResolve = () => {
              clearTimeout(timeout);
              resolve();
            };
          });
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;

        emitEnd('stopped');
      },

      cancel: () => {
        stopping = true;
        clearInactivityTimer();
        cleanup();
        emitEnd('cancelled');
      },

      onSpeechStart: (callback: () => void): Unsubscribe => {
        speechStartCallbacks.add(callback);
        return () => speechStartCallbacks.delete(callback);
      },

      onSpeechEnd: (callback: (result: DictationAdapter.Result) => void): Unsubscribe => {
        speechEndCallbacks.add(callback);
        return () => speechEndCallbacks.delete(callback);
      },

      onSpeech: (callback: (result: DictationAdapter.Result) => void): Unsubscribe => {
        speechCallbacks.add(callback);
        return () => speechCallbacks.delete(callback);
      },
    };

    const stopAudioCapture = () => {
      if (workletNode) {
        workletNode.disconnect();
        workletNode.port.close();
        workletNode = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    };

    const emitEnd = (reason: 'stopped' | 'cancelled' | 'error') => {
      if (session.status.type === 'ended') return;
      session.status = { type: 'ended', reason };
      for (const cb of speechEndCallbacks) cb({ transcript: fullText });
    };

    const cleanup = () => {
      stopAudioCapture();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      ws = null;
    };

    const startSession = async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: { ideal: TARGET_SAMPLE_RATE }, channelCount: 1 },
        });

        if (stopping) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        audioContext = new AudioContext();
        const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = audioContext.createMediaStreamSource(mediaStream);
        workletNode = new AudioWorkletNode(audioContext, 'pcm-downsample-processor');

        workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        source.connect(workletNode);
        workletNode.connect(audioContext.destination);

        ws = new WebSocket(this._wsUrl);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('WebSocket connection timeout')),
            10000
          );
          ws!.onmessage = (e) => {
            try {
              const msg = JSON.parse(e.data as string) as { type: string };
              if (msg.type === 'session.ready') {
                clearTimeout(timeout);
                resolve();
              } else if (msg.type === 'error') {
                clearTimeout(timeout);
                reject(new Error((msg as { message?: string }).message || 'Session error'));
              }
            } catch {
              // Ignore non-JSON during handshake
            }
          };
          ws!.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('WebSocket connection failed'));
          };
          ws!.onclose = () => {
            clearTimeout(timeout);
            reject(new Error('WebSocket closed before session ready'));
          };
        });

        if (stopping) return;

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as { type: string; text?: string };
            if (msg.type === 'text.delta' && msg.text) {
              fullText += msg.text;
              for (const cb of speechCallbacks) cb({ transcript: fullText, isFinal: false });
              resetInactivityTimer();
            } else if (msg.type === 'done') {
              for (const cb of speechCallbacks) cb({ transcript: fullText, isFinal: true });
              if (doneResolve) {
                doneResolve();
                doneResolve = null;
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          ws = null;
          if (!stopping) {
            emitEnd('stopped');
          }
        };

        session.status = { type: 'running' };
        for (const cb of speechStartCallbacks) cb();
        resetInactivityTimer();
      } catch (err) {
        console.error('[VoxtralDictation] Realtime setup failed:', err);
        cleanup();
        emitEnd('error');
      }
    };

    startSession();
    return session;
  }
}
