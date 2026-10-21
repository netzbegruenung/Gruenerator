import { AudioSession, registerGlobals } from '@livekit/react-native';
import { RemoteAudioTrack, Track } from 'livekit-client';

// WebRTC for livekit-client, which Mistral's voice SDK runs on.
registerGlobals();

// Mistral's browser transport plays the agent's voice through `track.attach()`,
// which builds an <audio> element. React Native has no DOM, and WebRTC plays
// remote audio natively, so `attach` hands back a stand-in the transport can
// remove again.
const standIn = () => ({ srcObject: null, remove() {} }) as unknown as HTMLMediaElement;
for (const proto of [Track.prototype, RemoteAudioTrack.prototype]) {
  proto.attach = standIn as Track['attach'];
  proto.detach = (() => []) as unknown as Track['detach'];
}

export { AudioSession };
