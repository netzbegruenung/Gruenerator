import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import CopyButton from './CopyButton';

// directContent is the only path that avoids the generatedText Zustand store
// (see commonFunctions.copyFormattedContent) — keeps this test purely prop-driven.
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

// userEvent.setup() installs its own clipboard stub, clobbering ours — so the
// mock must be (re-)applied *after* setup(), not before.
function setupUserWithClipboard(writeText: ReturnType<typeof vi.fn>) {
  const user = userEvent.setup();
  stubClipboard(writeText);
  return user;
}

describe('CopyButton', () => {
  it('renders the default label and copies directContent on click', async () => {
    render(<CopyButton directContent="Hallo Welt" />);
    const button = screen.getByRole('button', { name: 'In die Zwischenablage kopieren' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = setupUserWithClipboard(writeText);
    await user.click(button);
    expect(writeText).toHaveBeenCalledWith('Hallo Welt');
    await waitFor(() => expect(screen.getByText('Kopiert!')).toBeInTheDocument());
  });

  it('renders icon-only in the icon variant with an accessible label', () => {
    render(<CopyButton variant="icon" directContent="x" />);
    const button = screen.getByRole('button', { name: 'In die Zwischenablage kopieren' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('In die Zwischenablage kopieren')).not.toBeInTheDocument();
  });

  it('hides the text label in compact mode', () => {
    render(<CopyButton compact directContent="x" />);
    expect(screen.queryByText('In die Zwischenablage kopieren')).not.toBeInTheDocument();
  });

  it('logs and does not flip to "Kopiert!" when the clipboard write rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CopyButton directContent="Hallo Welt" />);
    const user = setupUserWithClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.queryByText('Kopiert!')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('has no axe violations', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    const { container } = render(<CopyButton directContent="x" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
