import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { LikeButton } from './LikeButton';

describe('LikeButton', () => {
  it('reflects liked state via aria-pressed', () => {
    render(<LikeButton liked count={0} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Like entfernen' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows the count only when greater than zero', () => {
    const { rerender } = render(<LikeButton liked={false} count={0} onToggle={vi.fn()} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();

    rerender(<LikeButton liked={false} count={5} onToggle={vi.fn()} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('fires onToggle on click', async () => {
    const onToggle = vi.fn();
    render(<LikeButton liked={false} count={0} onToggle={onToggle} />);
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('is disabled while loading and does not fire onToggle', async () => {
    const onToggle = vi.fn();
    render(<LikeButton liked={false} count={0} onToggle={onToggle} loading />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<LikeButton liked count={3} onToggle={vi.fn()} showLabel />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
