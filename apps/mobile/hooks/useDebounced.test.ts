import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useDebouncedCallback, useDebouncedCallbackWithCancel } from './useDebounced';

/**
 * Both hooks keep the latest callback in a ref on purpose: the debounced
 * function identity must stay stable across renders (it is handed to
 * onChangeText and friends), while still firing the newest closure. A dependency
 * array that included `callback` would rebuild the debounced function on every
 * keystroke and the debounce would never fire.
 *
 * No `act()` anywhere: neither hook holds state, so firing the callback or
 * advancing timers schedules no React work. Wrapping timer advancement in act()
 * would nest act scopes and break `result`.
 */

/** Matches the hooks' `T extends (...args: unknown[]) => void` constraint. */
type Callback = (...args: unknown[]) => void;

const spy = (): jest.Mock<Callback> => jest.fn<Callback>();

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useDebouncedCallback', () => {
  it('does not call through before the delay elapses', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallback(onCall, 500));

    result.current('a');
    jest.advanceTimersByTime(499);

    expect(onCall).not.toHaveBeenCalled();
  });

  it('calls through once the delay elapses', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallback(onCall, 500));

    result.current('a');
    jest.advanceTimersByTime(500);

    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith('a');
  });

  it('collapses a burst into a single trailing call', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallback(onCall, 500));

    result.current('a');
    jest.advanceTimersByTime(200);
    result.current('ab');
    jest.advanceTimersByTime(200);
    result.current('abc');
    jest.advanceTimersByTime(500);

    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith('abc');
  });

  it('keeps a stable identity across re-renders', () => {
    const { result, rerender } = renderHook<Callback, { cb: Callback }>(
      ({ cb }) => useDebouncedCallback(cb, 500),
      { initialProps: { cb: spy() } }
    );
    const first = result.current;

    rerender({ cb: spy() });

    expect(result.current).toBe(first);
  });

  it('fires the newest callback, not the one captured at mount', () => {
    const stale = spy();
    const fresh = spy();
    const { result, rerender } = renderHook<Callback, { cb: Callback }>(
      ({ cb }) => useDebouncedCallback(cb, 500),
      { initialProps: { cb: stale } }
    );

    rerender({ cb: fresh });
    result.current('x');
    jest.advanceTimersByTime(500);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(fresh).toHaveBeenCalledWith('x');
  });

  it('does not fire after unmount', () => {
    const onCall = spy();
    const { result, unmount } = renderHook(() => useDebouncedCallback(onCall, 500));

    result.current('a');
    unmount();
    jest.advanceTimersByTime(500);

    expect(onCall).not.toHaveBeenCalled();
  });

  it('defaults to a 500ms delay', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallback(onCall));

    result.current();
    jest.advanceTimersByTime(499);
    expect(onCall).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the debounced function when the delay changes', () => {
    const onCall = spy();
    const { result, rerender } = renderHook<Callback, { delay: number }>(
      ({ delay }) => useDebouncedCallback(onCall, delay),
      { initialProps: { delay: 500 } }
    );
    const first = result.current;

    rerender({ delay: 100 });
    expect(result.current).not.toBe(first);

    result.current('a');
    jest.advanceTimersByTime(100);
    expect(onCall).toHaveBeenCalledTimes(1);
  });
});

describe('useDebouncedCallbackWithCancel', () => {
  it('cancel() drops a pending call', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallbackWithCancel(onCall, 500));
    const [debounced, cancel] = result.current;

    debounced('a');
    cancel();
    jest.advanceTimersByTime(500);

    expect(onCall).not.toHaveBeenCalled();
  });

  it('cancel() on an idle hook is harmless', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallbackWithCancel(onCall, 500));

    expect(() => result.current[1]()).not.toThrow();
    expect(onCall).not.toHaveBeenCalled();
  });

  it('still works after a cancel', () => {
    const onCall = spy();
    const { result } = renderHook(() => useDebouncedCallbackWithCancel(onCall, 500));
    const [debounced, cancel] = result.current;

    debounced('a');
    cancel();
    debounced('b');
    jest.advanceTimersByTime(500);

    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith('b');
  });

  it('does not fire after unmount', () => {
    const onCall = spy();
    const { result, unmount } = renderHook(() => useDebouncedCallbackWithCancel(onCall, 500));

    result.current[0]('a');
    unmount();
    jest.advanceTimersByTime(500);

    expect(onCall).not.toHaveBeenCalled();
  });
});
