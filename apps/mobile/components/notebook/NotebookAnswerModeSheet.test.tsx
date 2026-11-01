import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import { usePreferencesStore } from '../../stores/preferencesStore';
import { lightTheme } from '../../theme/colors';

import { NotebookAnswerModeSheet, useAnswerModeAccessory } from './NotebookAnswerModeSheet';

// The real registry, without the package barrel (its runtime half does not
// load under jest-expo).
jest.mock('@gruenerator/chat', () => ({
  ...jest.requireActual<object>('../../../../packages/chat/src/lib/notebookAnswerMode'),
  ...jest.requireActual<object>('../../../../packages/chat/src/lib/notebookDepth'),
}));
// The sheet's chrome (Modal + keyboard controller) is not what is under test.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: unknown }) =>
    visible ? children : null,
}));

beforeEach(() => {
  usePreferencesStore.setState({ notebookAnswerMode: 'auto' });
});

describe('NotebookAnswerModeSheet', () => {
  it('lists the three modes, auto as the recommended one', async () => {
    await render(<NotebookAnswerModeSheet visible onClose={() => {}} theme={lightTheme} />);
    expect(screen.getByText('Magic Search')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Präzision')).toBeTruthy();
    expect(screen.getByText('Empfohlen')).toBeTruthy();
  });

  it('stores the picked mode and closes', async () => {
    const onClose = jest.fn();
    await render(<NotebookAnswerModeSheet visible onClose={onClose} theme={lightTheme} />);

    await fireEvent.press(screen.getByText('Präzision'));

    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('praezision');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers Manuell only on a start page', async () => {
    const { rerender } = await render(
      <NotebookAnswerModeSheet visible onClose={() => {}} theme={lightTheme} />
    );
    expect(screen.queryByText('Manuell')).toBeNull();

    await rerender(
      <NotebookAnswerModeSheet visible onClose={() => {}} theme={lightTheme} withManual />
    );
    await fireEvent.press(screen.getByText('Manuell'));

    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('manuell');
  });
});

describe('useAnswerModeAccessory', () => {
  it('labels the chip with the short label, like web', async () => {
    const { result } = await renderHook(() => useAnswerModeAccessory(() => {}));
    expect(result.current.label).toBe('Magic');
  });

  it('shows the default inside a conversation when Manuell is stored', async () => {
    usePreferencesStore.setState({ notebookAnswerMode: 'manuell' });
    const inThread = await renderHook(() => useAnswerModeAccessory(() => {}));
    const startPage = await renderHook(() =>
      useAnswerModeAccessory(() => {}, { withManual: true })
    );

    expect(inThread.result.current.label).toBe('Magic');
    expect(startPage.result.current.label).toBe('Manuell');
  });
});
