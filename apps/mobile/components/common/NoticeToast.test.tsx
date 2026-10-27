import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View as MockView } from 'react-native';

import { useNoticeStore } from '../../stores/noticeStore';

import { NoticeToast } from './NoticeToast';

// The worklets runtime does not load under jest; the entering/exiting
// animation is not what these tests are about.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: MockView },
  FadeInUp: undefined,
  FadeOutUp: undefined,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  useNoticeStore.setState({ notice: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('NoticeToast', () => {
  it('shows a notice and hides it after a few seconds', async () => {
    await render(<NoticeToast />);
    await act(() => useNoticeStore.getState().show('warning', 'Websuche eingeschränkt'));
    expect(screen.getByText('Websuche eingeschränkt')).toBeTruthy();

    await act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByTestId('notice-toast')).toBeNull();
  });

  it('replaces the old notice, and the old timer does not clear the new one', async () => {
    await render(<NoticeToast />);
    await act(() => useNoticeStore.getState().show('warning', 'Erste'));
    await act(() => jest.advanceTimersByTime(4000));
    await act(() => useNoticeStore.getState().show('error', 'Zweite', 'Details'));
    await act(() => jest.advanceTimersByTime(3000));

    expect(screen.queryByText('Erste')).toBeNull();
    expect(screen.getByText('Zweite')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
  });

  it('closes on tap', async () => {
    await render(<NoticeToast />);
    await act(() => useNoticeStore.getState().show('error', 'Export fehlgeschlagen'));
    await fireEvent.press(screen.getByTestId('notice-toast'));
    expect(screen.queryByTestId('notice-toast')).toBeNull();
  });
});
