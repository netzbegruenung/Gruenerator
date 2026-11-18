import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../test-utils';

import Spinner from './Spinner';

describe('Spinner', () => {
  it('exposes a status role with an accessible loading label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Wird geladen...' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Spinner withBackground white />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
