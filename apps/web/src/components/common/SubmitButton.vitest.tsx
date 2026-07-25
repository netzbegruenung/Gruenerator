import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import SubmitButton from './SubmitButton';

describe('SubmitButton', () => {
  it('renders the given text and fires onClick', async () => {
    const onClick = vi.fn();
    render(<SubmitButton text="Senden" onClick={onClick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Senden' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and marks aria-busy while loading, and blocks onClick', async () => {
    const onClick = vi.fn();
    render(<SubmitButton text="Senden" onClick={onClick} loading />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    // disabled buttons don't dispatch click in jsdom, so onClick is a no-op guard here
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows the statusMessage instead of text while loading when showStatus is set', () => {
    render(
      <SubmitButton
        text="Senden"
        onClick={vi.fn()}
        loading
        showStatus
        statusMessage="Wird verarbeitet..."
      />
    );
    expect(screen.getByText('Wird verarbeitet...')).toBeInTheDocument();
    expect(screen.queryByText('Senden')).not.toBeInTheDocument();
  });

  it('appends the image limit count/limit to the label', () => {
    render(
      <SubmitButton
        text="Bild erstellen"
        onClick={vi.fn()}
        imageLimitInfo={{ count: 2, limit: 5 }}
      />
    );
    expect(screen.getByText('Bild erstellen (2/5)')).toBeInTheDocument();
  });

  it('switches to a Grüneriere.../Abbrechen affordance while streaming with onAbort', async () => {
    const onAbort = vi.fn();
    const onClick = vi.fn();
    render(<SubmitButton text="Senden" onClick={onClick} isStreaming onAbort={onAbort} />);
    const button = screen.getByRole('button', { name: 'Abbrechen' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Grüneriere...')).toBeInTheDocument();

    await userEvent.setup().click(button);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honours the disabled prop (regression: it used to be dropped)', async () => {
    // Previously SubmitButton wired only `disabled={loading && !isStreaming}`, so a
    // caller's `disabled` (e.g. form-validity gating) was silently ignored and the
    // button stayed clickable. Now `disabled={disabled || (loading && !isStreaming)}`.
    const onClick = vi.fn();
    render(<SubmitButton text="Senden" onClick={onClick} disabled />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<SubmitButton text="Senden" onClick={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
