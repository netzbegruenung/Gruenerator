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

  it('merges a custom className', () => {
    render(<StatusBadge type="beta" className="my-extra-class" />);
    expect(screen.getByText('Beta').className).toContain('my-extra-class');
  });
});
