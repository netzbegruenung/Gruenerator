import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { FahrtStep } from './FahrtStep';

import type { ReisekostenState } from '@gruenerator/contracts';

const baseState: ReisekostenState = {
  rateKey: 'de-DE/nrw',
  stammdaten: { name: '', strasse: '', hausnr: '', plz: '', ort: '', email: '', iban: '' },
  reise: { anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' },
  fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
  verpflegungAbzuege: [],
  uebernachtung: null,
  spende: 0,
};

describe('FahrtStep', () => {
  it('renders a tile per Verkehrsmittel, none active initially', () => {
    render(<FahrtStep state={baseState} belege={[]} update={vi.fn()} onBeleg={vi.fn()} />);
    const bahnTile = screen.getByRole('button', { name: /Bahn/ });
    expect(bahnTile).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Bahnticket hochladen')).not.toBeInTheDocument();
  });

  it('toggles a mode on via update() and reveals its DetailBox', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<FahrtStep state={baseState} belege={[]} update={update} onBeleg={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Bahn/ }));
    const patch = update.mock.calls[0][0] as (s: ReisekostenState) => ReisekostenState;
    const next = patch(baseState);
    expect(next.fahrt.bahn).toEqual({ betrag: 0, belegVorhanden: false });
  });

  it('shows the Kfz DetailBox and its km field when kfz is active', () => {
    const state: ReisekostenState = {
      ...baseState,
      fahrt: {
        ...baseState.fahrt,
        kfz: { km: 10, fahrzeug: 'pkw', routenplanerVorhanden: false, dbFlexpreis: null },
      },
    };
    render(<FahrtStep state={state} belege={[]} update={vi.fn()} onBeleg={vi.fn()} />);
    expect(screen.getByText('Kfz (privater Pkw)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    // Below the reimbursable-km threshold: no DB-Flexpreis field shown.
    expect(screen.queryByText(/DB-Flexpreis/)).not.toBeInTheDocument();
  });

  it('requires a DB-Flexpreis once km exceeds the rate threshold', () => {
    const state: ReisekostenState = {
      ...baseState,
      fahrt: {
        ...baseState.fahrt,
        kfz: { km: 500, fahrzeug: 'pkw', routenplanerVorhanden: false, dbFlexpreis: null },
      },
    };
    render(<FahrtStep state={state} belege={[]} update={vi.fn()} onBeleg={vi.fn()} />);
    expect(screen.getByText(/DB-Flexpreis 2\. Kl\. \(Pflicht > 400 km\)/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FahrtStep state={baseState} belege={[]} update={vi.fn()} onBeleg={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
