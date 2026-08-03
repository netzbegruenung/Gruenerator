import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { Switch } from './ui';

describe('Switch (a11y regression)', () => {
  it('exposes an accessible name via ariaLabel', () => {
    // Bug fixed: a role="switch" <button> with no text content was anonymous to
    // screen readers (a wrapping <label> does not name it).
    render(<Switch checked={false} ariaLabel="Übernachtung anfügen" onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Übernachtung anfügen' })).toBeInTheDocument();
  });

  it('reflects checked state and toggles on click', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} ariaLabel="Übernachtung" onChange={onChange} />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.setup().click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('has no axe violations', async () => {
    const { container } = render(<Switch checked ariaLabel="Übernachtung" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
