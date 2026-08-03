import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import { BreakdownRow } from './BreakdownRow';

describe('BreakdownRow', () => {
  it('renders the emoji, label and formatted euro value', () => {
    render(<BreakdownRow emoji="🚉" label="2 An-/Abreisetag(e)" value={28} />);
    expect(screen.getByText('2 An-/Abreisetag(e)')).toBeInTheDocument();
    expect(screen.getByText('28,00 €')).toBeInTheDocument();
    expect(screen.getByText('🚉')).toBeInTheDocument();
  });

  it('formats zero using de-DE locale formatting', () => {
    render(<BreakdownRow emoji="📅" label="Voller Tag" value={0} />);
    expect(screen.getByText('0,00 €')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<BreakdownRow emoji="🚉" label="Test" value={10} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
