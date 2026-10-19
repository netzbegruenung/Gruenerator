import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterChip } from './FilterChip';

import { axe } from '@/test-utils';

describe('FilterChip', () => {
  it.each([
    ['„berlin“', 'Filter „berlin“ entfernen'],
    ['Offiziell', 'Filter „Offiziell“ entfernen'],
  ])('preserves visible label %s and announces one pair of quotes', async (label, name) => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<FilterChip label={label} onRemove={onRemove} />);

    const button = screen.getByRole('button', { name });
    expect(button).toHaveTextContent(label);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(button);
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
