import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { createElement as mockCreateElement, type ComponentProps } from 'react';
import { View as MockView } from 'react-native';

import { HeadlineSlider } from './HeadlineSlider';
import { type AsideTitle } from './WissenLayout';

// The worklets runtime does not load under jest (see NoticeToast.test.tsx); the fade and
// the swipe are device checks, what is under test is which parts re-render.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: MockView, createAnimatedComponent: (c: unknown) => c },
  Easing: { bezier: () => () => 0 },
  useSharedValue: (v: number) => ({ get: () => v, set: () => {} }),
  makeMutable: (v: number) => ({ get: () => v, set: () => {} }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: number) => v,
  withSpring: (v: number) => v,
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain: unknown = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

// Count renders of the title: it must sit out a slide change.
let mockTitleRenders = 0;
jest.mock('./WissenLayout', () => {
  const actual = jest.requireActual<{ AsideTitle: typeof AsideTitle }>('./WissenLayout');
  return {
    ...actual,
    AsideTitle: (props: ComponentProps<typeof AsideTitle>) => {
      mockTitleRenders += 1;
      return mockCreateElement(actual.AsideTitle, props);
    },
  };
});

const items = ['A', 'B', 'C'].map((k) => ({
  key: k,
  title: `Titel ${k}`,
  text: '',
  source: 'Grüne Bayern',
  time: 'vor 2 Std.',
  href: `https://example.org/${k}`,
}));

const noop = () => {};
const slider = (over: Partial<ComponentProps<typeof HeadlineSlider>> = {}) => (
  <HeadlineSlider
    items={items}
    loading={false}
    error={false}
    onRetry={noop}
    onOpenBriefing={noop}
    {...over}
  />
);

beforeEach(() => {
  mockTitleRenders = 0;
  jest.clearAllMocks();
});

describe('HeadlineSlider', () => {
  it('leaves the title alone when the slide changes', async () => {
    await render(slider());
    const before = mockTitleRenders;
    expect(before).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText('Meldung 2 von 3'));
    expect(screen.getByRole('adjustable').props.accessibilityLabel).toBe('Meldung 2 von 3');
    expect(mockTitleRenders).toBe(before);
  });

  it('shows the empty text without headlines', async () => {
    await render(slider({ items: [] }));
    expect(screen.getByText('Gerade keine neuen Schlagzeilen.')).toBeTruthy();
  });

  it('shows no dots with a single headline', async () => {
    await render(slider({ items: items.slice(0, 1) }));
    expect(screen.queryByRole('adjustable')).toBeNull();
    expect(screen.getByText('Titel A')).toBeTruthy();
  });

  it('says so when the load failed instead of reading as empty', async () => {
    const onRetry = jest.fn();
    await render(slider({ items: [], error: true, onRetry }));
    expect(screen.queryByText('Gerade keine neuen Schlagzeilen.')).toBeNull();
    await fireEvent.press(screen.getByText('Erneut versuchen'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens the article in the in-app browser on press', async () => {
    await render(slider());
    await fireEvent.press(screen.getByLabelText(/Meldung 1 von 3: Titel A/));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.org/A');
  });

  it('opens the briefing from the title', async () => {
    const onOpenBriefing = jest.fn();
    await render(slider({ onOpenBriefing }));
    await fireEvent.press(screen.getByText('Briefing'));
    expect(onOpenBriefing).toHaveBeenCalledTimes(1);
  });
});
