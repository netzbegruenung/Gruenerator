import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  type AgentSessionRequest,
  MistralVoiceAdapter,
  type MistralVoiceAdapterOptions,
} from '@gruenerator/voice/mistral';
import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import readyTone from '../../assets/sounds/voice-ready.wav';

const agentSessionRequest: AgentSessionRequest = async (path, { method, body }) => {
  const res = await getGlobalApiClient().request({
    url: `/voice/agent-session${path}`,
    method,
    ...(body !== undefined && { data: body }),
  });
  return res.data as unknown;
};

/**
 * The same two notes web plays once the agent has joined, and a tap for a phone
 * on silent. The call's audio session is LiveKit's and still running: the
 * player must not end it when the tone is over, which `expo-audio` does by
 * default on iOS.
 */
function playReadyCue(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const player = createAudioPlayer(readyTone, { keepAudioSessionActive: true });
  player.play();
  setTimeout(() => player.remove(), 1000);
}

/** The adapter as the app runs it: bearer auth, LiveKit's native audio session and the ready tone. */
export function createMobileVoiceAdapter(
  options: Omit<MistralVoiceAdapterOptions, 'request' | 'meterTrack' | 'prepareAudio' | 'readyCue'>
): MistralVoiceAdapter {
  return new MistralVoiceAdapter({
    ...options,
    request: agentSessionRequest,
    readyCue: playReadyCue,
    // LiveKit loads with the first call, not with the screen: a binary without
    // its native module (an older build that got this JS over the air) then
    // fails the call with a message instead of crashing on import.
    prepareAudio: async () => {
      const { AudioSession } = await import('./livekitGlobals');
      await AudioSession.startAudioSession();
      return () => void AudioSession.stopAudioSession();
    },
  });
}
