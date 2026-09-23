import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { usePreferencesStore } from '../../stores/preferencesStore';
import { lightTheme } from '../../theme/colors';

import { NotebookAnswerModeSheet } from './NotebookAnswerModeSheet';

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
  it('lists the three modes, auto as the recommended one', () => {
    render(<NotebookAnswerModeSheet visible onClose={() => {}} theme={lightTheme} />);
    expect(screen.getByText('Automatisch')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Präzision')).toBeTruthy();
    expect(screen.getByText('Empfohlen')).toBeTruthy();
  });

  it('stores the picked mode and closes', () => {
    const onClose = jest.fn();
    render(<NotebookAnswerModeSheet visible onClose={onClose} theme={lightTheme} />);

    fireEvent.press(screen.getByText('Präzision'));

    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('praezision');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
