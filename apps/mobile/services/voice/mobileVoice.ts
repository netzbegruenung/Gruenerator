import './livekitGlobals';

import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  type AgentSessionRequest,
  MistralVoiceAdapter,
  type MistralVoiceAdapterOptions,
} from '@gruenerator/voice/mistral';
import { AudioSession } from '@livekit/react-native';

import { DEV_AUTH_BYPASS } from '../devAuth';

const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS_TOKEN as string | undefined;

const agentSessionRequest: AgentSessionRequest = async (path, { method, body }) => {
  const res = await getGlobalApiClient().request({
    url: `/voice/agent-session${path}`,
    method,
    ...(body !== undefined && { data: body }),
    // The bypass user has no token; the dev API accepts its header instead.
    ...(DEV_AUTH_BYPASS &&
      DEV_BYPASS_TOKEN && { headers: { 'x-dev-auth-bypass': DEV_BYPASS_TOKEN } }),
  });
  return res.data as unknown;
};

/** The adapter as the app runs it: bearer auth and LiveKit's native audio session. */
export function createMobileVoiceAdapter(
  options: Pick<MistralVoiceAdapterOptions, 'onToolActivity' | 'onError'>
): MistralVoiceAdapter {
  return new MistralVoiceAdapter({
    ...options,
    request: agentSessionRequest,
    prepareAudio: async () => {
      await AudioSession.startAudioSession();
      return () => void AudioSession.stopAudioSession();
    },
  });
}
