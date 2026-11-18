import { describe, expect, it, vi } from 'vitest';

import SegmentedControl from './SegmentedControl';

import { axe, render, screen, userEvent } from '@/test-utils';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl', () => {
  it('renders the options and reports a new choice', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl value="a" onChange={onChange} options={[...OPTIONS]} aria-label="Wahl" />
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('ignores a click on the active option', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl value="a" onChange={onChange} options={[...OPTIONS]} aria-label="Wahl" />
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes axe', async () => {
    const { container } = render(
      <SegmentedControl value="a" onChange={() => {}} options={[...OPTIONS]} aria-label="Wahl" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
