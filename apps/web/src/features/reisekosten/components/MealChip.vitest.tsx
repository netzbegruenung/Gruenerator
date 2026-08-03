import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { MealChip } from './MealChip';

describe('MealChip', () => {
  it('reflects the active state via aria-pressed', () => {
    render(<MealChip emoji="🥐" label="Frühstück" active onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Frühstück/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('reflects the inactive state via aria-pressed', () => {
    render(<MealChip emoji="🥐" label="Frühstück" active={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Frühstück/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('fires onClick when pressed', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<MealChip emoji="🥐" label="Frühstück" active={false} onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <MealChip emoji="🥐" label="Frühstück" active onClick={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
