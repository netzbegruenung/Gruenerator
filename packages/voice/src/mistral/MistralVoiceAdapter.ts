import {
  createVoiceSession,
  type RealtimeVoiceAdapter,
  type VoiceSessionHelpers,
} from '@assistant-ui/core';
import { type Room } from 'livekit-client';

import { type AgentSessionRequest, type HostedSessionOptions, type ToolCall } from './types';

export interface MistralVoiceAdapterOptions {
  request: AgentSessionRequest;
  /** A tool started (`call`) or the last one ended (`null`). */
  onToolActivity: (call: ToolCall | null) => void;
  onError: (message: string | null) => void;
  /**
   * Loudness of a track, 0–1, for the orb; returns its stop function. Web
   * measures with an AudioContext; without one the orb follows the mode only.
   */
  meterTrack?: (track: MediaStreamTrack, emit: (level: number) => void) => () => void;
  /**
   * Runs before the session connects and returns what to run once it ends
   * (mobile: LiveKit's native audio session).
   */
  prepareAudio?: () => Promise<() => void>;
}

/**
 * Mistral's hosted voice agent (`hostedSession.ts`) as an assistant-ui
 * realtime voice session: transcripts land in the thread, and the orb reads
 * mode and volume from the runtime.
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
      const { request, onToolActivity, onError, meterTrack, prepareAudio } = this.options;
      // createVoiceSession only ends the session; the reason would be lost.
      const fail = (err: unknown): never => {
        onError(err instanceof Error ? err.message : String(err));
        throw err;
      };
      onError(null);
      const releaseAudio = prepareAudio ? await prepareAudio().catch(fail) : null;

      let stopMeter: (() => void) | null = null;
      let tornDown = false;
      const tearDown = () => {
        if (tornDown) return;
        tornDown = true;
        stopMeter?.();
        stopMeter = null;
        onToolActivity(null);
        releaseAudio?.();
      };

      // Loaded on the first call: the SDK and LiveKit stay out of the chat bundle.
      const { openHostedSession } = await import('./hostedSession');
      const { session } = await openHostedSession(this.sessionOptions, request, {
        onToolStart: (call) => onToolActivity(call),
        onToolEnd: () => onToolActivity(null),
      }).catch((err: unknown) => {
        tearDown();
        return fail(err);
      });

      const tracks: Partial<Record<'local' | 'remote', MediaStreamTrack>> = {};
      let speaking = false;
      // The orb follows whoever has the turn: the agent's voice while it
      // speaks, the microphone otherwise.
      const remeter = () => {
        stopMeter?.();
        stopMeter = null;
        const track = speaking ? tracks.remote : tracks.local;
        if (track && meterTrack)
          stopMeter = meterTrack(track, (v) => !helpers.isDisposed() && helpers.emitVolume(v));
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
        tearDown();
        return fail(err);
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
