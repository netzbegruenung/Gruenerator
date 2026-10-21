import { type ChatVoice } from '@gruenerator/chat';
import {
  type AgentSessionRequest,
  MistralVoiceAdapter,
  type MistralVoiceAdapterOptions,
  TOOL_LABEL,
} from '@gruenerator/voice/mistral';

import { platformFetch } from '../../utils/platformFetch';

export const agentSessionRequest: AgentSessionRequest = async (path, { method, body }) => {
  const res = await platformFetch(`/api/voice/agent-session${path}`, {
    method,
    credentials: 'include',
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (!res.ok) throw new Error(`Sitzung: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
};

/**
 * Loudness of one track, 0–1, sampled per animation frame and eased both
 * ways. Only changes above 2 % are emitted, as in GrueneratorRealtimeVoiceAdapter.
 */
export function meterTrack(track: MediaStreamTrack, emit: (level: number) => void): () => void {
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

/** The adapter as web runs it: cookie auth and an AudioContext level meter. */
export function createWebVoiceAdapter(
  options: Pick<MistralVoiceAdapterOptions, 'onToolActivity' | 'onError'>
): MistralVoiceAdapter {
  return new MistralVoiceAdapter({ ...options, request: agentSessionRequest, meterTrack });
}

let activity: string | null = null;
const listeners = new Set<() => void>();

function setActivity(next: string | null) {
  activity = next;
  for (const listener of listeners) listener();
}

/**
 * Mistral's hosted voice agent in the chat composer. Instance admins only:
 * audio and tool results go to Mistral's global endpoint (see
 * agentSessionController.ts), and the API refuses everyone else.
 */
export const mistralChatVoice: ChatVoice = {
  createAdapter: () =>
    createWebVoiceAdapter({
      onToolActivity: (call) =>
        setActivity(call ? (TOOL_LABEL[call.name] ?? 'Schlage nach') : null),
      onError: (message) => {
        if (message)
          void import('sonner').then(({ toast }) =>
            toast.error('Sprachgespräch', { description: message })
          );
      },
    }),
  getActivity: () => activity,
  subscribeActivity: (onChange) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  },
};
