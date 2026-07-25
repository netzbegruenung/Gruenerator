import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import { BelegStatus } from './BelegStatus';

import type { ExtractBelegResponse } from '@gruenerator/contracts';

const beleg: ExtractBelegResponse = {
  type: 'bahn',
  betrag: 42.5,
  datum: '2026-03-01',
  von: 'Köln',
  nach: 'Berlin',
  businessPackage: null,
  confidence: 0.9,
};

describe('BelegStatus', () => {
  it('renders extracted fields when a beleg is present', () => {
    render(<BelegStatus beleg={beleg} confirmed={false} hasBetrag={false} />);
    expect(screen.getByText('✨ Beleg ausgelesen')).toBeInTheDocument();
    expect(screen.getByText('42,50 € · 2026-03-01 · Köln → Berlin')).toBeInTheDocument();
  });

  it('shows the business-package hint only when businessPackage is true', () => {
    render(
      <BelegStatus
        beleg={{ ...beleg, businessPackage: true }}
        confirmed={false}
        hasBetrag={false}
      />
    );
    expect(screen.getByText(/Business-Package erkannt/)).toBeInTheDocument();
  });

  it('falls back to a single leg when only "von" is present', () => {
    render(
      <BelegStatus
        beleg={{ ...beleg, betrag: null, datum: null, nach: null }}
        confirmed={false}
        hasBetrag={false}
      />
    );
    expect(screen.getByText('Köln')).toBeInTheDocument();
  });

  it('shows a manual-confirmation message when confirmed without a beleg', () => {
    render(<BelegStatus beleg={null} confirmed hasBetrag={false} />);
    expect(screen.getByText(/manuell bestätigt/)).toBeInTheDocument();
  });

  it('warns when an amount is set but no beleg is attached or confirmed', () => {
    render(<BelegStatus beleg={null} confirmed={false} hasBetrag />);
    expect(screen.getByText(/Beleg erforderlich/)).toBeInTheDocument();
  });

  it('renders nothing when there is no beleg, no confirmation and no amount', () => {
    const { container } = render(<BelegStatus beleg={null} confirmed={false} hasBetrag={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations', async () => {
    const { container } = render(<BelegStatus beleg={beleg} confirmed={false} hasBetrag={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
