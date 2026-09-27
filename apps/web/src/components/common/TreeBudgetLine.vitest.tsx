import { type TreeBudgetStatus } from '@gruenerator/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TreeBudgetChip, TreeBudgetLine } from './TreeBudgetLine';

function status(overrides: Partial<TreeBudgetStatus>): TreeBudgetStatus {
  return {
    used: 2.5,
    limit: 10,
    remaining: 7.5,
    resetsAt: '2026-09-19T00:00:00.000Z',
    newsletterBonus: false,
    ...overrides,
  };
}

describe('TreeBudgetLine', () => {
  it('shows the plural sentence with the remaining and total amount', () => {
    render(<TreeBudgetLine status={status({ used: 2.5, limit: 15, remaining: 7.5 })} />);
    expect(screen.getByText('Heute noch 7,5 von 15 Bäumen.')).toBeInTheDocument();
  });

  it('uses the singular "Baum" when exactly one is left', () => {
    render(<TreeBudgetLine status={status({ used: 14, limit: 15, remaining: 1 })} />);
    expect(screen.getByText('Heute noch 1 Baum von 15.')).toBeInTheDocument();
  });

  it('shows the unlimited notice when there is no limit', () => {
    render(<TreeBudgetLine status={status({ limit: null, remaining: null })} />);
    expect(screen.getByText('Unbegrenzt auf dieser Instanz.')).toBeInTheDocument();
  });
});

/**
 * The chip says the same thing as the line, but only while it is worth saying:
 * it is a warning in a toolbar, not a permanent readout.
 */
describe('TreeBudgetChip', () => {
  it('stays away while there is plenty left', () => {
    render(<TreeBudgetChip status={status({ used: 2.5, limit: 10, remaining: 7.5 })} />);
    expect(screen.queryByText(/Heute noch/)).not.toBeInTheDocument();
  });

  it('appears once the balance drops below the threshold', () => {
    render(<TreeBudgetChip status={status({ used: 5.1, limit: 10, remaining: 4.9 })} />);
    expect(screen.getByText('Heute noch 4,9 von 10 Bäumen.')).toBeInTheDocument();
  });

  it('is still there on the last Baum and on none at all', () => {
    const { unmount } = render(<TreeBudgetChip status={status({ used: 9, remaining: 1 })} />);
    expect(screen.getByText('Heute noch 1 Baum von 10.')).toBeInTheDocument();
    unmount();

    render(<TreeBudgetChip status={status({ used: 10, remaining: 0 })} />);
    expect(screen.getByText('Heute noch 0 von 10 Bäumen.')).toBeInTheDocument();
  });

  it('stays away on an unlimited instance — there is nothing to run out of', () => {
    render(<TreeBudgetChip status={status({ limit: null, remaining: null })} />);
    expect(screen.queryByText(/Unbegrenzt/)).not.toBeInTheDocument();
  });
});
