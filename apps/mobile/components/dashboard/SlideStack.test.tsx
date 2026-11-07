import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { memo } from 'react';
import { AppState, Text, View as MockView, type AppStateStatus } from 'react-native';

import { SlideStack, SLIDE_INTERVAL_MS, type Slide } from './SlideStack';

// The worklets runtime does not load under jest (see NoticeToast.test.tsx); what is
// under test is the slide state and its lifecycle, not the fade.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: MockView, createAnimatedComponent: (c: unknown) => c },
  Easing: { bezier: () => () => 0 },
  useSharedValue: (v: number) => ({ get: () => v, set: () => {} }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: number) => v,
}));
// Gesture Handler's worklet gestures need the Reanimated runtime too. The swipe itself
// is a device check; here the detector passes its child through.
jest.mock('react-native-gesture-handler', () => {
  const chain: unknown = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
}));

let renders = 0;
const Counter = memo(function Counter({ name }: { name: string }) {
  renders += 1;
  return <Text>{name}</Text>;
});

const slides: Slide[] = ['a', 'b', 'c'].map((k, i) => ({
  key: k,
  label: `Meldung ${i + 1} von 3`,
  content: <Counter name={k} />,
}));

const activeLabel = () => screen.getByRole('adjustable').props.accessibilityLabel as string;

describe('SlideStack', () => {
  it('does not re-render the slide contents on a slide change', async () => {
    await render(<SlideStack slides={slides} />);
    const before = renders;
    expect(before).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText('Meldung 2 von 3'));
    expect(activeLabel()).toBe('Meldung 2 von 3');
    expect(renders).toBe(before);
  });

  it('shows no dots with a single slide', async () => {
    await render(<SlideStack slides={slides.slice(0, 1)} intervalMs={SLIDE_INTERVAL_MS} />);
    expect(screen.queryByRole('adjustable')).toBeNull();
    expect(screen.queryByLabelText('Meldung 1 von 3')).toBeNull();
  });

  it('renders nothing but an empty frame without slides', async () => {
    await render(<SlideStack slides={[]} />);
    expect(screen.queryByRole('adjustable')).toBeNull();
  });

  describe('lifecycle', () => {
    let appState: AppStateStatus;
    let onChange: ((s: AppStateStatus) => void) | null;

    beforeEach(() => {
      jest.useFakeTimers();
      appState = 'active';
      onChange = null;
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        get: () => appState,
      });
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((
        _type: string,
        listener: (s: AppStateStatus) => void
      ) => {
        onChange = listener;
        return { remove: () => {} };
      }) as typeof AppState.addEventListener);
    });

    afterEach(() => {
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        value: 'active',
        writable: true,
      });
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    const setAppState = (next: AppStateStatus) => {
      appState = next;
      onChange?.(next);
    };

    it('advances after the interval', async () => {
      await render(<SlideStack slides={slides} intervalMs={SLIDE_INTERVAL_MS} />);
      expect(activeLabel()).toBe('Meldung 1 von 3');
      await act(() => jest.advanceTimersByTime(SLIDE_INTERVAL_MS));
      expect(activeLabel()).toBe('Meldung 2 von 3');
    });

    it('does not advance while the app is in the background and waits a full interval after returning', async () => {
      await render(<SlideStack slides={slides} intervalMs={SLIDE_INTERVAL_MS} />);
      await act(() => jest.advanceTimersByTime(SLIDE_INTERVAL_MS - 1000));

      await act(() => setAppState('background'));
      await act(() => jest.advanceTimersByTime(10 * SLIDE_INTERVAL_MS));
      expect(activeLabel()).toBe('Meldung 1 von 3');

      await act(() => setAppState('active'));
      await act(() => jest.advanceTimersByTime(SLIDE_INTERVAL_MS - 1));
      expect(activeLabel()).toBe('Meldung 1 von 3');
      await act(() => jest.advanceTimersByTime(1));
      expect(activeLabel()).toBe('Meldung 2 von 3');
    });

    it('stops for good after a manual change until the pause button restarts it', async () => {
      await render(
        <SlideStack
          slides={slides}
          intervalMs={SLIDE_INTERVAL_MS}
          renderControls={({ playing, togglePlaying }) => (
            <Text onPress={togglePlaying}>{playing ? 'pause' : 'play'}</Text>
          )}
        />
      );
      await fireEvent.press(screen.getByLabelText('Meldung 3 von 3'));
      expect(screen.getByText('play')).toBeTruthy();
      await act(() => jest.advanceTimersByTime(3 * SLIDE_INTERVAL_MS));
      expect(activeLabel()).toBe('Meldung 3 von 3');

      await fireEvent.press(screen.getByText('play'));
      await act(() => jest.advanceTimersByTime(SLIDE_INTERVAL_MS));
      expect(activeLabel()).toBe('Meldung 1 von 3');
    });

    it('keeps the active index valid when fewer slides arrive', async () => {
      const view = await render(<SlideStack slides={slides} />);
      await fireEvent.press(screen.getByLabelText('Meldung 3 von 3'));
      await view.rerender(<SlideStack slides={slides.slice(0, 2)} />);
      // Index 2 of 2 slides wraps to the first; what matters is that one is active.
      expect(activeLabel()).toBe('Meldung 1 von 3');
    });
  });
});
