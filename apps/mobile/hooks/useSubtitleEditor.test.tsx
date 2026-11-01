import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useSubtitleEditorStore } from '../stores/subtitleEditorStore';

import { useSubtitleEditor } from './useSubtitleEditor';

import type { VideoPlayer } from 'expo-video';

jest.mock('@gruenerator/shared', () => ({
  updateProject: jest.fn(),
  saveProject: jest.fn(),
  useProjectsStore: jest.fn(),
}));

describe('useSubtitleEditor seekToTime', () => {
  beforeEach(() => {
    useSubtitleEditorStore.getState().reset();
  });

  it('moves the player and the store clock to the requested time', async () => {
    const player = { currentTime: 0, playing: false, duration: 0 };
    const { result } = await renderHook(() =>
      useSubtitleEditor({ player: player as unknown as VideoPlayer })
    );

    await act(() => result.current.seekToTime(12));

    expect(player.currentTime).toBe(12);
    expect(useSubtitleEditorStore.getState().currentTime).toBe(12);
  });

  it('does nothing without a player', async () => {
    const { result } = await renderHook(() => useSubtitleEditor({ player: null }));

    await act(() => result.current.seekToTime(12));

    expect(useSubtitleEditorStore.getState().currentTime).toBe(0);
  });
});
