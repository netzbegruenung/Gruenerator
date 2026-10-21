import {
  createVoiceSession,
  type RealtimeVoiceAdapter,
  type VoiceSessionHelpers,
} from '@assistant-ui/react';
import { type Room } from 'livekit-client';

import { type HostedSessionOptions, type ToolCall } from './hostedSession';

interface MistralVoiceAdapterOptions {
  /** A tool started (`call`) or the last one ended (`null`). */
  onToolActivity: (call: ToolCall | null) => void;
  onError: (message: string | null) => void;
}

/**
 * Loudness of one track, 0–1, sampled per animation frame and eased both
 * ways. Only changes above 2 % are emitted, as in GrueneratorRealtimeVoiceAdapter.
 */
function meterTrack(track: MediaStreamTrack, emit: (level: number) => void): () => void {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let level = 0;
  let emitted = 0;
  let frame = requestAnimationFrame(function tick() {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += ((s - 128) / 128) ** 2;
    const rms = Math.min(1, Math.sqrt(sum / samples.length) * 2);
    level += (rms - level) * (rms > level ? 0.25 : 0.06);
    if (Math.abs(level - emitted) > 0.02) {
      emitted = level;
      emit(level);
    }
    frame = requestAnimationFrame(tick);
  });
  return () => {
    cancelAnimationFrame(frame);
    void ctx.close();
  };
}

/**
 * Mistral's hosted voice agent (`hostedSession.ts`) as an assistant-ui
 * realtime voice session: transcripts land in the thread, and `VoiceOrb`
 * reads mode and volume from the runtime.
 *
 * Typed text goes in through `sendText` while a call runs, into the same
 * conversation as speech.
 */
export class MistralVoiceAdapter implements RealtimeVoiceAdapter {
  private sessionOptions: HostedSessionOptions = {
    variant: 'tools',
    notebookId: null,
    fastMode: true,
  };

  constructor(private readonly options: MistralVoiceAdapterOptions) {}

  /** Read at connect time, so the page can change mode between calls. */
  setSessionOptions(options: HostedSessionOptions): void {
    this.sessionOptions = options;
  }

  connect(connectOptions: { abortSignal?: AbortSignal }): RealtimeVoiceAdapter.Session {
    return createVoiceSession(connectOptions, async (helpers: VoiceSessionHelpers) => {
      const { onToolActivity, onError } = this.options;
      onError(null);
      // Loaded on the first call: the SDK and LiveKit stay out of the chat bundle.
      const { openHostedSession } = await import('./hostedSession');
      const { session } = await openHostedSession(this.sessionOptions, {
        onToolStart: (call) => onToolActivity(call),
        onToolEnd: () => onToolActivity(null),
      }).catch((err: unknown) => {
        // createVoiceSession only ends the session; the reason would be lost.
        onError(err instanceof Error ? err.message : String(err));
        throw err;
      });

      const tracks: Partial<Record<'local' | 'remote', MediaStreamTrack>> = {};
      let speaking = false;
      let stopMeter: (() => void) | null = null;
      // The orb follows whoever has the turn: the agent's voice while it
      // speaks, the microphone otherwise.
      const remeter = () => {
        stopMeter?.();
        stopMeter = null;
        const track = speaking ? tracks.remote : tracks.local;
        if (track)
          stopMeter = meterTrack(track, (v) => !helpers.isDisposed() && helpers.emitVolume(v));
      };
      const tearDown = () => {
        stopMeter?.();
        stopMeter = null;
        onToolActivity(null);
      };

      session.on('transcript', (e) =>
        helpers.emitTranscript({
          role: e.role === 'user' ? 'user' : 'assistant',
          text: e.content,
          isFinal: e.final,
        })
      );
      session.on('agent_state_changed', (e) => {
        const nowSpeaking = e.state === 'speaking';
        helpers.emitMode(nowSpeaking ? 'speaking' : 'listening');
        if (nowSpeaking !== speaking) {
          speaking = nowSpeaking;
          remeter();
        }
      });
      session.on('audio_track', (e) => {
        tracks[e.source] = e.track;
        remeter();
      });
      session.on('error', (e) => onError(`${e.source}/${e.code}: ${e.message}`));
      session.on('disconnected', (e) => {
        tearDown();
        if (e.reason === 'error' || e.reason === 'start_failed') helpers.end('error', e.reason);
        else helpers.end('finished');
      });

      await session.connect().catch((err: unknown) => {
        onError(err instanceof Error ? err.message : String(err));
        throw err;
      });
      helpers.setStatus({ type: 'running' });

      return {
        disconnect: () => {
          tearDown();
          void session.close();
        },
        mute: () => void session.setInputEnabled(false),
        unmute: () => void session.setInputEnabled(true),
        sendText: async (text: string) => {
          // The SDK has no text input, but Mistral's agent is a LiveKit agent,
          // and those read typed text from the `lk.chat` topic. The room is
          // private to the SDK's transport (3.1.0), hence the reach-in.
          const room = (session as unknown as { _transport?: { _room?: Room | null } })._transport
            ?._room;
          if (!room) throw new Error('Sprachsitzung ist nicht verbunden');
          await room.localParticipant.sendText(text, { topic: 'lk.chat' });
        },
      };
    });
  }
}
