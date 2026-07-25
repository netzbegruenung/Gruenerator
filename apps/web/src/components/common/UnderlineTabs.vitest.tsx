import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { UnderlineTabs } from './UnderlineTabs';

const tabs = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'settings', label: 'Einstellungen' },
] as const;

describe('UnderlineTabs', () => {
  it('renders a tablist with the given tabs', () => {
    render(<UnderlineTabs tabs={[...tabs]} value="overview" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('marks only the active tab as aria-selected', () => {
    render(<UnderlineTabs tabs={[...tabs]} value="settings" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(screen.getByRole('tab', { name: 'Einstellungen' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('calls onChange with the clicked tab key', async () => {
    const onChange = vi.fn();
    render(<UnderlineTabs tabs={[...tabs]} value="overview" onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Einstellungen' }));
    expect(onChange).toHaveBeenCalledWith('settings');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <UnderlineTabs tabs={[...tabs]} value="overview" onChange={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
