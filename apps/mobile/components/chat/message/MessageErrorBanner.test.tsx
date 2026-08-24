import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
// Aliased with a `Mock` prefix so the hoisted jest.mock factory below may
// reference them — babel-plugin-jest-hoist rejects any other out-of-scope name.
import { Text as MockText, View as MockView } from 'react-native';

import { lightTheme } from '../../../theme/colors';

import { MessageErrorBanner } from './MessageErrorBanner';
import { flagRegenerate } from './threadRunSignals';

import type { ReactNode } from 'react';

const mockReload = jest.fn();
let mockMessageError: string | undefined;

jest.mock('./threadRunSignals', () => ({ flagRegenerate: jest.fn() }));

/**
 * `ErrorPrimitive` is stubbed rather than driven through a real runtime: the
 * whole point of the component is that the primitive's own gate decides whether
 * anything renders, so the test needs to set that gate directly. `Root` returns
 * null without an error exactly as the real one does.
 */
jest.mock('@assistant-ui/react-native', () => ({
  useAui: () => ({ message: { reload: mockReload } }),
  ErrorPrimitive: {
    Root: ({ children, ...props }: { children?: ReactNode }) =>
      mockMessageError === undefined ? null : <MockView {...props}>{children}</MockView>,
    Message: (props: object) =>
      mockMessageError === undefined ? null : <MockText {...props}>{mockMessageError}</MockText>,
  },
}));

const mockFlagRegenerate = flagRegenerate as jest.MockedFunction<typeof flagRegenerate>;

beforeEach(() => {
  jest.clearAllMocks();
  mockMessageError = undefined;
});

describe('MessageErrorBanner', () => {
  it('renders nothing on a healthy turn', () => {
    const { toJSON } = render(<MessageErrorBanner theme={lightTheme} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the adapter’s message so a failure stops reading as a short answer', () => {
    mockMessageError = 'Verbindung abgebrochen';
    render(<MessageErrorBanner theme={lightTheme} />);
    expect(screen.getByText('Verbindung abgebrochen')).toBeTruthy();
  });

  // The order matters: flagging AFTER reload would let the run start unflagged
  // and leave the failed turn behind in chat_messages.
  it('flags the regenerate before reloading, so the failed turn is replaced', () => {
    mockMessageError = 'Zeitüberschreitung';
    render(<MessageErrorBanner theme={lightTheme} />);

    fireEvent.press(screen.getByTestId('chat-message-error-retry'));

    expect(mockFlagRegenerate).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockFlagRegenerate.mock.invocationCallOrder[0]).toBeLessThan(
      mockReload.mock.invocationCallOrder[0] as number
    );
  });
});
