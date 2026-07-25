import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the label for each badge type', () => {
    render(<StatusBadge type="early-access" />);
    expect(screen.getByText('Early Access')).toBeInTheDocument();
  });

  it('renders the ki label', () => {
    render(<StatusBadge type="ki" />);
    expect(screen.getByText('KI')).toBeInTheDocument();
  });

  it('applies the card-variant positioning class by default vs inline', () => {
    const { rerender } = render(<StatusBadge type="beta" variant="card" />);
    expect(screen.getByText('Beta').className).toContain('absolute');

    rerender(<StatusBadge type="beta" variant="inline" />);
    expect(screen.getByText('Beta').className).not.toContain('absolute');
    expect(screen.getByText('Beta').className).toContain('inline-flex');
  });

  it('applies the sidebar variant class', () => {
    render(<StatusBadge type="beta" variant="sidebar" />);
    expect(screen.getByText('Beta').className).toContain('tracking-[0.3px]');
  });

  it('merges a custom className', () => {
    render(<StatusBadge type="beta" className="my-extra-class" />);
    expect(screen.getByText('Beta').className).toContain('my-extra-class');
  });
});
