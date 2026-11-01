import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { setAudioModeAsync } from 'expo-audio';

import { useNativeTTS } from './useNativeTTS';

type StatusListener = (status: { didJustFinish: boolean }) => void;

const mockPlayer = {
  playing: false,
  listener: null as StatusListener | null,
  addListener: jest.fn((_event: string, cb: StatusListener) => {
    mockPlayer.listener = cb;
  }),
  replace: jest.fn(),
  play: jest.fn(() => {
    mockPlayer.playing = true;
  }),
  pause: jest.fn(() => {
    mockPlayer.playing = false;
  }),
  release: jest.fn(),
  setActiveForLockScreen: jest.fn(),
  clearLockScreenControls: jest.fn(),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: jest
    .fn()
    .mockImplementation(() => ({ uri: 'file:///cache/tts.wav', writeSync: jest.fn() })),
}));

// One float32 sample, base64-encoded, as the TTS stream sends it.
const sample = Buffer.from(new Float32Array([0.5]).buffer).toString('base64');
const mockFetch = jest.fn(async () => ({
  ok: true,
  text: async () => `data: ${JSON.stringify({ audio: sample, sampleRate: 24000 })}\n`,
}));
jest.mock('@gruenerator/chat', () => ({
  stripForSpeech: (text: string) => text,
  useChatConfigStore: (select: (s: unknown) => unknown) =>
    select({
      fetch: mockFetch,
      endpoints: { chatStream: 'https://api.test/api/chat-graph/stream' },
    }),
}));

describe('useNativeTTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer.playing = false;
    mockPlayer.listener = null;
  });

  it('reads aloud on the lock screen and hands the session back when done', async () => {
    const { result } = await renderHook(() => useNativeTTS());
    await act(() => result.current.play('Erster Satz. Zweiter Satz.'));

    expect(setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(true, {
      title: 'Erster Satz.',
      artist: 'Grünerator',
    });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(result.current.state).toBe('playing');

    await act(async () => mockPlayer.listener?.({ didJustFinish: true }));
    expect(result.current.state).toBe('idle');
    expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  });

  it('clears the lock screen when stopped', async () => {
    const { result } = await renderHook(() => useNativeTTS());
    await act(() => result.current.play('Ein Satz.'));
    await act(async () => result.current.stop());

    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('hands the session back when the row unmounts while the mode is switching', async () => {
    let resolveMode: () => void = () => undefined;
    jest
      .mocked(setAudioModeAsync)
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveMode = resolve)));
    const { result, unmount } = await renderHook(() => useNativeTTS());
    let reading: Promise<void> = Promise.resolve();
    await act(async () => {
      reading = result.current.play('Ein Satz.');
    });

    await unmount();
    resolveMode();
    await act(() => reading);

    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  });

  it('leaves the audio session alone when an idle row unmounts', async () => {
    const { result, unmount } = await renderHook(() => useNativeTTS());
    await act(() => result.current.play('Ein Satz.'));
    mockPlayer.playing = false;
    await act(async () => mockPlayer.listener?.({ didJustFinish: true }));
    jest.clearAllMocks();

    await unmount();
    expect(mockPlayer.release).toHaveBeenCalled();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});
