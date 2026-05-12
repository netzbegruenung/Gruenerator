import {
  createVoiceSession,
  type RealtimeVoiceAdapter,
  type VoiceSessionHelpers,
} from '@assistant-ui/react';
import {
  PCM_DOWNSAMPLE_PROCESSOR_NAME,
  TARGET_SAMPLE_RATE,
  installPcmDownsampleWorklet,
} from '../lib/pcmDownsampleWorklet';
import { AudioBufferQueue } from '../lib/audioBufferQueue';
import { resolveVoiceWsUrl } from '../lib/resolveVoiceWsUrl';
import { splitSentences } from '../lib/sentenceSplitter';

export type RealtimeVoiceErrorReason =
  | 'mic-permission-denied'
  | 'mic-unavailable'
  | 'audio-context-failed'
  | 'worklet-failed'
  | 'websocket-failed'
  | 'session-handshake-failed'
  | 'server-error'
  | 'chat-stream-failed'
  | 'tts-stream-failed'
  | 'unknown';

export interface GrueneratorRealtimeVoiceConfig {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
  language?: string;
  ttsVoiceId?: string;
  onError?: (reason: RealtimeVoiceErrorReason, error: unknown) => void;
  getThreadId?: () => string | null;
  getAgentId?: () => string | null;
  onAssistantTurnDone?: (text: string, threadId: string | null) => void;
  /**
   * Client-side VAD parameters. The Voxtral WebSocket has no server endpointing —
   * it streams text.delta forever until we send `{type:"stop"}`. We end-point
   * locally by tracking mic RMS: once speech has been observed for at least
   * `speechMinMs`, a continuous silence window of `silenceEndMs` triggers stop.
   */
  vadSpeechRms?: number;
  vadSpeechMinMs?: number;
  vadSilenceEndMs?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class GrueneratorRealtimeVoiceAdapter implements RealtimeVoiceAdapter {
  private wsUrl: string;
  private apiBaseUrl: string;
  private fetchFn: typeof fetch;
  private ttsVoiceId?: string;
  private onError?: (reason: RealtimeVoiceErrorReason, error: unknown) => void;
  private getThreadId?: () => string | null;
  private getAgentId?: () => string | null;
  private onAssistantTurnDone?: (text: string, threadId: string | null) => void;
  private vadSpeechRms: number;
  private vadSpeechMinMs: number;
  private vadSilenceEndMs: number;
  private history: ChatMessage[] = [];

  constructor(config: GrueneratorRealtimeVoiceConfig = {}) {
    this.wsUrl = resolveVoiceWsUrl(config.apiBaseUrl, '/api/voice/realtime');
    this.apiBaseUrl = config.apiBaseUrl ?? '';
    this.fetchFn = config.fetchFn ?? fetch;
    this.ttsVoiceId = config.ttsVoiceId;
    this.onError = config.onError;
    this.getThreadId = config.getThreadId;
    this.getAgentId = config.getAgentId;
    this.onAssistantTurnDone = config.onAssistantTurnDone;
    this.vadSpeechRms = config.vadSpeechRms ?? 0.025;
    this.vadSpeechMinMs = config.vadSpeechMinMs ?? 250;
    this.vadSilenceEndMs = config.vadSilenceEndMs ?? 1100;
  }

  connect(options: { abortSignal?: AbortSignal }): RealtimeVoiceAdapter.Session {
    return createVoiceSession(options, async (helpers) => this.setup(helpers, options.abortSignal));
  }

  private async setup(helpers: VoiceSessionHelpers, abortSignal?: AbortSignal) {
    // Each session starts fresh. The adapter is constructed once at provider
    // mount, so without this reset, history would accumulate across every
    // voice conversation the user ever has on this page load.
    this.history = [];

    const fail = (reason: RealtimeVoiceErrorReason, err: unknown) => {
      console.error(`[GrueneratorRealtimeVoice] ${reason}:`, err);
      this.onError?.(reason, err);
      helpers.end('error', err);
    };

    // --- mic capture ---
    let mediaStream: MediaStream | null = null;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: { ideal: TARGET_SAMPLE_RATE }, channelCount: 1 },
      });
    } catch (err) {
      const reason: RealtimeVoiceErrorReason =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'mic-permission-denied'
          : 'mic-unavailable';
      fail(reason, err);
      return { disconnect: () => {}, mute: () => {}, unmute: () => {} };
    }

    if (helpers.isDisposed()) {
      mediaStream.getTracks().forEach((t) => t.stop());
      return { disconnect: () => {}, mute: () => {}, unmute: () => {} };
    }

    // --- WebSocket STT ---
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsUrl);
    } catch (err) {
      mediaStream.getTracks().forEach((t) => t.stop());
      fail('websocket-failed', err);
      return { disconnect: () => {}, mute: () => {}, unmute: () => {} };
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10_000);
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as { type: string; message?: string };
            if (msg.type === 'session.ready') {
              clearTimeout(t);
              resolve();
            } else if (msg.type === 'error') {
              clearTimeout(t);
              reject(new Error(msg.message ?? 'Session error'));
            }
          } catch {
            /* ignore non-JSON during handshake */
          }
        };
        ws.onerror = () => {
          clearTimeout(t);
          reject(new Error('WebSocket connection failed'));
        };
        ws.onclose = () => {
          clearTimeout(t);
          reject(new Error('WebSocket closed before session ready'));
        };
      });
    } catch (err) {
      mediaStream.getTracks().forEach((t) => t.stop());
      try {
        ws.close();
      } catch {
        /* noop */
      }
      fail('session-handshake-failed', err);
      return { disconnect: () => {}, mute: () => {}, unmute: () => {} };
    }

    if (helpers.isDisposed()) {
      mediaStream.getTracks().forEach((t) => t.stop());
      try {
        ws.close();
      } catch {
        /* noop */
      }
      return { disconnect: () => {}, mute: () => {}, unmute: () => {} };
    }

    // --- audio graph for STT downsample ---
    let audioContext: AudioContext;
    let workletNode: AudioWorkletNode;
    let micSource: MediaStreamAudioSourceNode;
    let micAnalyser: AnalyserNode;
    let micAnalyserBuf: Float32Array<ArrayBuffer>;
    try {
      audioContext = new AudioContext();
      if (audioContext.state === 'suspended') await audioContext.resume();
      await installPcmDownsampleWorklet(audioContext);
      micSource = audioContext.createMediaStreamSource(mediaStream);
      workletNode = new AudioWorkletNode(audioContext, PCM_DOWNSAMPLE_PROCESSOR_NAME);
      micAnalyser = audioContext.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyserBuf = new Float32Array(
        new ArrayBuffer(micAnalyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
      );

      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        // Drop audio frames while the agent is responding — otherwise the
        // assistant's TTS audio plays through the speaker, leaks into the
        // mic, and gets re-transcribed as the next user turn.
        if (inAgentTurn) return;
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };

      micSource.connect(workletNode);
      micSource.connect(micAnalyser);
      // Required on some browsers to keep the worklet's process loop scheduled.
      workletNode.connect(audioContext.destination);
    } catch (err) {
      mediaStream.getTracks().forEach((t) => t.stop());
      try {
        ws.close();
      } catch {
        /* noop */
      }
      fail(err instanceof DOMException ? 'worklet-failed' : 'audio-context-failed', err);
      return { disconnect: () => {}, mute: () => {}, unmute: () => {} };
    }

    // --- mode + agent-turn tracking ---
    let currentMode: RealtimeVoiceAdapter.Mode = 'listening';
    let chatAbort: AbortController | null = null;
    let inAgentTurn = false;

    const setMode = (m: RealtimeVoiceAdapter.Mode) => {
      if (currentMode === m) return;
      currentMode = m;
      helpers.emitMode(m);
    };

    // --- VAD state (reset between turns) ---
    let hasSpeech = false;
    let speechAccMs = 0;
    let silenceAccMs = 0;
    let lastTickMs = performance.now();
    let lastEmittedVolume = -1;

    const resetVad = () => {
      hasSpeech = false;
      speechAccMs = 0;
      silenceAccMs = 0;
    };

    const enterAgentTurn = () => {
      inAgentTurn = true;
      resetVad();
      setMode('speaking');
    };

    const exitAgentTurn = () => {
      inAgentTurn = false;
      resetVad();
      lastTickMs = performance.now();
      setMode('listening');
    };

    const ttsQueue = new AudioBufferQueue({
      onVolume: (v) => {
        if (currentMode === 'speaking') helpers.emitVolume(v);
      },
      onDrained: () => {
        exitAgentTurn();
      },
    });

    // --- mic loop: emits volume + runs the VAD state machine ---
    let micRafId: number | null = null;
    const tickMic = () => {
      if (helpers.isDisposed()) return;
      const now = performance.now();
      const dt = now - lastTickMs;
      lastTickMs = now;

      micAnalyser.getFloatTimeDomainData(micAnalyserBuf);
      let s = 0;
      for (let i = 0; i < micAnalyserBuf.length; i++) {
        const v = micAnalyserBuf[i] ?? 0;
        s += v * v;
      }
      const rms = Math.sqrt(s / micAnalyserBuf.length);
      if (currentMode === 'listening') {
        const v = Math.min(1, rms * 2);
        // Deadband ~2% — without this, emitVolume fires every frame (~60Hz)
        // and forces a WebGL uniform update + React state churn even when the
        // audio level is effectively unchanged.
        if (Math.abs(v - lastEmittedVolume) > 0.02) {
          lastEmittedVolume = v;
          helpers.emitVolume(v);
        }
      }

      if (!inAgentTurn && currentMode === 'listening' && ws.readyState === WebSocket.OPEN) {
        if (rms >= this.vadSpeechRms) {
          speechAccMs += dt;
          silenceAccMs = 0;
          if (!hasSpeech && speechAccMs >= this.vadSpeechMinMs) {
            hasSpeech = true;
          }
        } else {
          silenceAccMs += dt;
          speechAccMs = 0;
          if (hasSpeech && silenceAccMs >= this.vadSilenceEndMs) {
            try {
              ws.send(JSON.stringify({ type: 'stop' }));
            } catch {
              /* swallow */
            }
            // Latch state into the "agent will respond" window by clearing
            // hasSpeech — next iteration's silence won't re-trigger stop.
            hasSpeech = false;
          }
        }
      }

      micRafId = requestAnimationFrame(tickMic);
    };
    micRafId = requestAnimationFrame(tickMic);

    // --- TTS streaming for a single sentence ---
    const ttsSentence = async (text: string) => {
      try {
        const response = await this.fetchFn(`${this.apiBaseUrl}/api/voice/tts/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId: this.ttsVoiceId, language: 'de' }),
          credentials: 'include',
        });
        if (!response.ok || !response.body) {
          this.onError?.('tts-stream-failed', new Error(`TTS ${response.status}`));
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6)) as {
                audio?: string;
                sampleRate?: number;
                error?: string;
              };
              if (data.error) {
                this.onError?.('tts-stream-failed', new Error(data.error));
                return;
              }
              if (data.audio && data.sampleRate) {
                ttsQueue.enqueueBase64Float32(data.audio, data.sampleRate);
              }
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        this.onError?.('tts-stream-failed', err);
      }
    };

    // --- ChatGraph SSE → split sentences → sequential TTS ---
    let ttsQueueActive = false;
    const pendingSentences: string[] = [];

    // Mistral TTS rejects input whose sanitized form is empty (e.g. emoji-only
    // fragments like "😊"). The sentence splitter occasionally leaves these as
    // trailing fragments. Skip anything without a speakable character — letters
    // (incl. German umlauts) or digits.
    const SPEAKABLE_RE = /[\p{L}\p{N}]/u;

    const drainTTSQueue = async () => {
      if (ttsQueueActive) return;
      ttsQueueActive = true;
      while (pendingSentences.length > 0) {
        const next = pendingSentences.shift()!;
        if (!SPEAKABLE_RE.test(next)) continue;
        await ttsSentence(next);
      }
      ttsQueueActive = false;
      ttsQueue.signalDone();
    };

    const streamChat = async (userText: string) => {
      chatAbort?.abort();
      const controller = new AbortController();
      chatAbort = controller;

      this.history.push({ role: 'user', content: userText });
      const threadId = this.getThreadId?.() ?? null;

      let assistantText = '';
      let sentenceBuffer = '';

      // The contract router calls AI-SDK v6's `convertToModelMessages`, which
      // expects the UIMessage shape (`parts: [{type:'text', text}]`) — not the
      // older ModelMessage `{role, content: string}` shape. Mapping here keeps
      // the internal history representation simple.
      const uiMessages = this.history.map((m, idx) => ({
        id: `voice_${idx}`,
        role: m.role,
        parts: [{ type: 'text' as const, text: m.content }],
      }));

      try {
        const response = await this.fetchFn(`${this.apiBaseUrl}/api/chat-graph/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: uiMessages,
            threadId,
            agentId: this.getAgentId?.() ?? null,
          }),
          signal: controller.signal,
          credentials: 'include',
        });
        if (!response.ok || !response.body) {
          this.onError?.('chat-stream-failed', new Error(`ChatGraph ${response.status}`));
          ttsQueue.signalDone();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith('data: ')) continue;
            // Only consume text_delta events for TTS. Reasoning, memory,
            // citations, etc. share the same SSE stream — speaking them
            // would be incoherent.
            if (currentEvent !== 'text_delta') continue;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            const delta = typeof data['text'] === 'string' ? (data['text'] as string) : null;
            if (!delta) continue;
            assistantText += delta;
            sentenceBuffer += delta;
            helpers.emitTranscript({ role: 'assistant', text: assistantText, isFinal: false });

            const { complete, remainder } = splitSentences(sentenceBuffer);
            sentenceBuffer = remainder;
            for (const sentence of complete) {
              pendingSentences.push(sentence);
            }
            void drainTTSQueue();
          }
        }

        const tail = sentenceBuffer.trim();
        if (tail) pendingSentences.push(tail);
        sentenceBuffer = '';
        await drainTTSQueue();

        helpers.emitTranscript({ role: 'assistant', text: assistantText, isFinal: true });
        this.history.push({ role: 'assistant', content: assistantText });
        this.onAssistantTurnDone?.(assistantText, threadId);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        this.onError?.('chat-stream-failed', err);
        ttsQueue.signalDone();
      }
    };

    // --- STT message handler (post-handshake) ---
    let lastUserText = '';
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          text?: string;
          message?: string;
        };
        if (msg.type === 'text.delta' && msg.text) {
          lastUserText += msg.text;
          helpers.emitTranscript({ role: 'user', text: lastUserText, isFinal: false });
        } else if (msg.type === 'done') {
          const finalText = lastUserText.trim();
          lastUserText = '';
          if (finalText.length > 0) {
            helpers.emitTranscript({ role: 'user', text: finalText, isFinal: true });
            enterAgentTurn();
            void streamChat(finalText).catch((err) => {
              console.error('[RealtimeVoice] streamChat unexpected:', err);
              exitAgentTurn();
            });
          } else {
            // No speech was transcribed despite VAD trigger — reset state and
            // stay in listening so the user can try again.
            resetVad();
          }
        } else if (msg.type === 'error') {
          this.onError?.('server-error', msg.message ?? 'Server error');
        }
      } catch {
        /* swallow */
      }
    };

    ws.onerror = () => {
      if (helpers.isDisposed()) return;
      fail('websocket-failed', new Error('WebSocket error during session'));
    };

    ws.onclose = () => {
      if (helpers.isDisposed()) return;
      helpers.end('finished');
    };

    helpers.setStatus({ type: 'running' });
    helpers.emitMode('listening');

    // --- controls ---
    const setTrackEnabled = (enabled: boolean) => {
      mediaStream?.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
    };

    // tearDown is idempotent — multiple triggers (user click, tab hide,
    // page unload, abort signal) are all safe and only release resources once.
    let tornDown = false;
    const tearDown = () => {
      if (tornDown) return;
      tornDown = true;
      // Release the microphone FIRST — this is the privacy-critical step.
      // Browsers keep the recording indicator on until tracks are .stop()'d.
      mediaStream?.getTracks().forEach((t) => t.stop());
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      } catch {
        /* noop */
      }
      try {
        ws.close();
      } catch {
        /* noop */
      }
      chatAbort?.abort();
      if (micRafId != null) cancelAnimationFrame(micRafId);
      micRafId = null;
      try {
        workletNode.disconnect();
        workletNode.port.close();
      } catch {
        /* noop */
      }
      try {
        micSource.disconnect();
      } catch {
        /* noop */
      }
      audioContext.close().catch(() => {});
      void ttsQueue.close();
      // Detach privacy guards so they don't fire again on stale state.
      removePrivacyGuards();
    };

    // === Privacy guards ===
    // Anything that can plausibly mean "the user is no longer actively
    // engaged with this page" MUST release the microphone. GDPR / Art. 6 (1)
    // (a) requires affirmative consent; an unattended live mic violates that.
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden' && !tornDown) {
        // Belt-and-suspenders: release mic immediately (tearDown) AND notify
        // the runtime so the UI flips to ended without showing an error.
        tearDown();
        try {
          helpers.end('cancelled');
        } catch {
          /* helpers may already be disposed */
        }
      }
    };
    const handlePageHide = () => {
      // pagehide fires on iOS Safari where beforeunload doesn't; covers
      // navigation, bfcache eviction, and tab close in one event.
      if (!tornDown) tearDown();
    };
    const handleAbort = () => {
      if (!tornDown) {
        tearDown();
        try {
          helpers.end('cancelled');
        } catch {
          /* already disposed */
        }
      }
    };
    const removePrivacyGuards = () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('beforeunload', handlePageHide);
      }
      abortSignal?.removeEventListener('abort', handleAbort);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('beforeunload', handlePageHide);
    }
    abortSignal?.addEventListener('abort', handleAbort, { once: true });

    return {
      disconnect: () => {
        tearDown();
      },
      mute: () => setTrackEnabled(false),
      unmute: () => setTrackEnabled(true),
    };
  }
}
