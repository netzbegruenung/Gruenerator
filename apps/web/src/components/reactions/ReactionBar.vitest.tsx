import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ReactionBar } from './ReactionBar';

const reactions = [
  { emoji: '👍', count: 3, reacted: true },
  { emoji: '🎉', count: 1, reacted: false },
];

describe('ReactionBar', () => {
  it('renders one chip per reaction with count and pressed state', () => {
    render(<ReactionBar reactions={reactions} onToggle={vi.fn()} />);

    const thumbs = screen.getByRole('button', { name: '👍 – 3 Reaktionen, darunter deine' });
    expect(thumbs).toHaveAttribute('aria-pressed', 'true');
    expect(thumbs).toHaveTextContent('3');

    const party = screen.getByRole('button', { name: '🎉 – 1 Reaktion' });
    expect(party).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles the emoji when a chip is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ReactionBar reactions={reactions} onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: /^🎉/ }));
    expect(onToggle).toHaveBeenCalledWith('🎉');
  });

  it('opens the picker with all eight emojis and closes it after a choice', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ReactionBar reactions={reactions} onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Reaktion hinzufügen' }));
    const options = await screen.findAllByRole('button', { name: /^Mit .+ reagieren$/ });
    expect(options.map((o) => o.textContent)).toEqual([
      '👍',
      '👎',
      '😄',
      '🎉',
      '😕',
      '❤️',
      '🚀',
      '👀',
    ]);
    expect(screen.getByRole('button', { name: 'Mit 👍 reagieren' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: 'Mit 🚀 reagieren' }));
    expect(onToggle).toHaveBeenCalledWith('🚀');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mit 🚀 reagieren' })).not.toBeInTheDocument()
    );
  });

  it('keeps a legacy emoji removable but not addable', () => {
    render(
      <ReactionBar
        reactions={[
          { emoji: '💡', count: 2, reacted: false },
          { emoji: '🔥', count: 1, reacted: true },
        ]}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /^💡/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^🔥/ })).toBeEnabled();
  });

  it('disables every control when disabled', () => {
    render(<ReactionBar reactions={reactions} onToggle={vi.fn()} disabled />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('has no axe violations, closed and with the picker open', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReactionBar reactions={reactions} onToggle={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Reaktion hinzufügen' }));
    await screen.findByRole('button', { name: 'Mit 👀 reagieren' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
