import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CopyTextButton } from './CopyTextButton';

// userEvent.setup() installs its own navigator.clipboard stub, so our
// override must be applied AFTER setup() or it gets clobbered.
function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return { user, writeText };
}

describe('CopyTextButton', () => {
  it('copies the given text and flips to the "copied" icon state', async () => {
    const { user, writeText } = stubClipboard();
    render(<CopyTextButton text="Hallo Welt" ariaLabel="Text kopieren" />);
    await user.click(screen.getByRole('button', { name: 'Text kopieren' }));
    expect(writeText).toHaveBeenCalledWith('Hallo Welt');
  });

  it('shows the label text when showLabel is true, toggling Kopieren/Kopiert', async () => {
    const { user } = stubClipboard();
    render(<CopyTextButton text="Hallo" ariaLabel="Kopieren" showLabel />);
    expect(screen.getByText('Kopieren')).toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Kopiert')).toBeInTheDocument();
  });

  it('omits the label span entirely when showLabel is false', () => {
    render(<CopyTextButton text="Hallo" ariaLabel="Kopieren" />);
    expect(screen.queryByText('Kopieren')).not.toBeInTheDocument();
  });
});
