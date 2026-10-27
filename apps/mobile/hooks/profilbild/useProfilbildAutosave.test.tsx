import { FREE_BACKGROUND_ID } from '@gruenerator/shared/profilbild';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { AUTOSAVE_DELAY, useProfilbildAutosave } from './useProfilbildAutosave';

import type { ProfilbildSnapshot } from './useProfilbildShare';

const snapshot = (x: number, backgroundId = 'tanne'): ProfilbildSnapshot => ({
  model: {
    background: { kind: 'color', color: '#005437' },
    person: { x, y: 100, scale: 0.85 },
    stickers: [],
  },
  backgroundId,
  custom: null,
});

const PHOTO = {};

function setup(initial: ProfilbildSnapshot | null, reopened = false, session: unknown = PHOTO) {
  const persist = jest.fn<(s: ProfilbildSnapshot) => Promise<void>>().mockResolvedValue(undefined);
  const hook = renderHook(
    (props: { snap: ProfilbildSnapshot | null; session: unknown }) =>
      useProfilbildAutosave(props.session, props.snap, persist, reopened),
    { initialProps: { snap: initial, session } }
  );
  return { persist, ...hook };
}

const pause = () =>
  act(async () => {
    jest.advanceTimersByTime(AUTOSAVE_DELAY);
  });

describe('useProfilbildAutosave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves a new Profilbild after the pause, and again after a change', async () => {
    const { persist, result, rerender } = setup(snapshot(0));
    expect(persist).not.toHaveBeenCalled();
    await pause();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('saved');

    rerender({ snap: snapshot(40), session: PHOTO });
    await pause();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(snapshot(40));
  });

  it('waits for the pause: a second edit restarts it', async () => {
    const { persist, rerender } = setup(snapshot(0));
    await pause();
    rerender({ snap: snapshot(10), session: PHOTO });
    await act(() => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY - 100);
    });
    rerender({ snap: snapshot(20), session: PHOTO });
    await act(() => {
      jest.advanceTimersByTime(AUTOSAVE_DELAY - 100);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    await pause();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(snapshot(20));
  });

  it('does not save a reopened Profilbild until it is changed', async () => {
    const { persist, rerender } = setup(snapshot(0), true);
    await pause();
    expect(persist).not.toHaveBeenCalled();
    rerender({ snap: snapshot(0, 'klee'), session: PHOTO });
    await pause();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('saves nothing while there is nothing to save', async () => {
    const { persist } = setup(null);
    await pause();
    expect(persist).not.toHaveBeenCalled();
  });

  it('keeps a change made just before leaving', async () => {
    const { persist, rerender, unmount } = setup(snapshot(0));
    await pause();
    rerender({ snap: snapshot(10), session: PHOTO });
    unmount();
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('does not save again what was just saved by hand', async () => {
    const { persist, result } = setup(snapshot(0));
    await act(() => result.current.noteSaved());
    await pause();
    expect(persist).not.toHaveBeenCalled();
    expect(result.current.state).toBe('saved');
  });

  it('says so when saving fails, and tries again with the next change', async () => {
    const { persist, result, rerender } = setup(snapshot(0));
    persist.mockRejectedValueOnce(new Error('offline'));
    await pause();
    expect(result.current.state).toBe('error');
    rerender({ snap: snapshot(10), session: PHOTO });
    await pause();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('saved');
  });

  it('saves a change of the free colour, though its id stays the same', async () => {
    const free = (color: string): ProfilbildSnapshot => ({
      ...snapshot(0, FREE_BACKGROUND_ID),
      model: { ...snapshot(0).model, background: { kind: 'color', color } },
    });
    const { persist, rerender } = setup(free('#ff0000'));
    await pause();
    rerender({ snap: free('#00ff00'), session: PHOTO });
    await pause();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(free('#00ff00'));
  });

  it('drops a pending save when the photo is dropped, instead of running it on leaving', () => {
    const { persist, rerender, unmount } = setup(snapshot(0));
    rerender({ snap: null, session: null });
    unmount();
    expect(persist).not.toHaveBeenCalled();
  });

  it('starts a new photo without the status of the last one', async () => {
    const { result, rerender } = setup(snapshot(0));
    await pause();
    expect(result.current.state).toBe('saved');
    rerender({ snap: snapshot(0), session: {} });
    expect(result.current.state).toBe('idle');
  });
});
