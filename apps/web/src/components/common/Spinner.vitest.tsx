import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../test-utils';

import Spinner from './Spinner';

describe('Spinner', () => {
  it('exposes a status role with an accessible loading label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Wird geladen...' })).toBeInTheDocument();
  });

  it('applies the size class matrix', () => {
    const { rerender } = render(<Spinner size="small" />);
    expect(screen.getByRole('status').className).toContain('h-4');

    rerender(<Spinner size="large" />);
    expect(screen.getByRole('status').className).toContain('h-10');
  });

  it('applies the white variant border classes', () => {
    render(<Spinner white />);
    expect(screen.getByRole('status').className).toContain('border-t-white');
  });

  it('wraps in a background container when withBackground is set', () => {
    render(<Spinner withBackground />);
    const status = screen.getByRole('status');
    expect(status.parentElement?.className).toContain('bg-[var(--klee,#46a758)]');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Spinner withBackground white />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
