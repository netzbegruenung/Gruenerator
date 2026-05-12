import { type DictationAdapter } from '@assistant-ui/react';
import {
  PCM_DOWNSAMPLE_PROCESSOR_NAME,
  TARGET_SAMPLE_RATE,
  installPcmDownsampleWorklet,
} from '../lib/pcmDownsampleWorklet';
import { resolveVoiceWsUrl } from '../lib/resolveVoiceWsUrl';

type Unsubscribe = () => void;

const INACTIVITY_TIMEOUT_MS = 30_000;

export type VoxtralErrorReason =
  | 'mic-permission-denied'
  | 'mic-unavailable'
  | 'audio-context-failed'
  | 'worklet-failed'
  | 'websocket-failed'
  | 'session-handshake-failed'
  | 'server-error'
  | 'unknown';

interface VoxtralDictationConfig {
  apiBaseUrl?: string;
  language?: string;
  onError?: (reason: VoxtralErrorReason, error: unknown) => void;
}

export class VoxtralDictationAdapter implements DictationAdapter {
  private _wsUrl: string;
  private _onError?: (reason: VoxtralErrorReason, error: unknown) => void;

  constructor(config: VoxtralDictationConfig = {}) {
    this._wsUrl = resolveVoiceWsUrl(config.apiBaseUrl, '/api/voice/realtime');
    this._onError = config.onError;
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

    const fail = (reason: VoxtralErrorReason, err: unknown) => {
      console.error(`[VoxtralDictation] ${reason}:`, err);
      this._onError?.(reason, err);
      cleanup();
      emitEnd('error');
    };

    const cleanup = () => {
      stopAudioCapture();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      ws = null;
    };

    const startSession = async () => {
      // Step 1: Microphone permission first (uses the user-gesture from the click).
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: { ideal: TARGET_SAMPLE_RATE }, channelCount: 1 },
        });
      } catch (err) {
        const reason: VoxtralErrorReason =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'mic-permission-denied'
            : 'mic-unavailable';
        fail(reason, err);
        return;
      }

      if (stopping) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Step 2: Open WebSocket and await server handshake BEFORE wiring audio.
      // This eliminates the dropped-audio window and ensures setup failures
      // (server unreachable, auth, etc.) surface before the UI shows "recording".
      try {
        ws = new WebSocket(this._wsUrl);
      } catch (err) {
        fail('websocket-failed', err);
        return;
      }

      try {
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
      } catch (err) {
        fail('session-handshake-failed', err);
        return;
      }

      if (stopping) {
        cleanup();
        return;
      }

      // Step 3: Build AudioContext + worklet now that the server is ready to receive.
      try {
        audioContext = new AudioContext();
        // Browsers may create the context in 'suspended' state under autoplay policy.
        // Resuming is a no-op if already running.
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        await installPcmDownsampleWorklet(audioContext);

        const source = audioContext.createMediaStreamSource(mediaStream);
        workletNode = new AudioWorkletNode(audioContext, PCM_DOWNSAMPLE_PROCESSOR_NAME);

        workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        source.connect(workletNode);
        // Connecting to destination keeps the worklet's process() loop scheduled
        // without producing audible output (the worklet has no audio output, only
        // postMessage). Required on some browsers to keep the graph alive.
        workletNode.connect(audioContext.destination);
      } catch (err) {
        fail(err instanceof DOMException ? 'worklet-failed' : 'audio-context-failed', err);
        return;
      }

      // Step 4: Wire ongoing message + close handlers, then announce 'running'.
      ws!.onmessage = (e) => {
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
          } else if (msg.type === 'error') {
            fail('server-error', (msg as { message?: string }).message ?? 'Server error');
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws!.onerror = () => {
        if (!stopping) fail('websocket-failed', new Error('WebSocket error during session'));
      };

      ws!.onclose = () => {
        ws = null;
        if (!stopping) emitEnd('stopped');
      };

      session.status = { type: 'running' };
      for (const cb of speechStartCallbacks) cb();
      resetInactivityTimer();
    };

    startSession();
    return session;
  }
}
