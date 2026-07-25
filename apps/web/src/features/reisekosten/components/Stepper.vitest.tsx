import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { STEPS } from '../constants';

import { Stepper } from './Stepper';

// The button's accessible name is its full text content (number/✓ + label), so
// match on the label as a substring rather than an exact string.
function stepButton(label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByRole('button', { name: new RegExp(escaped) });
}

describe('Stepper', () => {
  it('renders one button per step with its label', () => {
    render(<Stepper step={0} onStep={vi.fn()} />);
    STEPS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button')).toHaveLength(STEPS.length);
  });

  it('marks the current step via aria-current', () => {
    render(<Stepper step={2} onStep={vi.fn()} />);
    const current = stepButton(STEPS[2]);
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('shows a checkmark for steps before the current one', () => {
    render(<Stepper step={2} onStep={vi.fn()} />);
    const done = stepButton(STEPS[0]);
    expect(done).toHaveTextContent('✓');
  });

  it('shows the 1-based index for steps not yet reached', () => {
    render(<Stepper step={0} onStep={vi.fn()} />);
    const upcoming = stepButton(STEPS[1]);
    expect(upcoming).toHaveTextContent('2');
  });

  it('calls onStep with the clicked step index', async () => {
    const onStep = vi.fn();
    const user = userEvent.setup();
    render(<Stepper step={0} onStep={onStep} />);
    await user.click(stepButton(STEPS[3]));
    expect(onStep).toHaveBeenCalledWith(3);
  });

  it('has no axe violations', async () => {
    const { container } = render(<Stepper step={1} onStep={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
