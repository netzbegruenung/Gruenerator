import { VERANSTALTUNGEN } from '@gruenerator/shared/reisekosten';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { ReiseStep } from './ReiseStep';

import type { ReisekostenState } from '@gruenerator/contracts';

const baseState: ReisekostenState = {
  rateKey: 'de-DE/nrw',
  stammdaten: {
    name: '',
    strasse: '',
    hausnr: '',
    plz: '',
    ort: '',
    email: '',
    iban: '',
  },
  reise: { anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' },
  fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
  verpflegungAbzuege: [],
  uebernachtung: null,
  spende: 0,
};

describe('ReiseStep', () => {
  it('renders the anlass/ziel values from state', () => {
    render(
      <ReiseStep
        state={{ ...baseState, reise: { ...baseState.reise, anlass: 'Länderrat', ziel: 'Berlin' } }}
        setReise={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('Länderrat')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Berlin')).toBeInTheDocument();
  });

  it('calls setReise when typing the Anlass field', async () => {
    const setReise = vi.fn();
    const user = userEvent.setup();
    render(<ReiseStep state={baseState} setReise={setReise} />);
    await user.type(screen.getByPlaceholderText('z. B. Länderrat'), 'X');
    expect(setReise).toHaveBeenCalledWith({ anlass: 'X' });
  });

  it('prefills anlass/ziel from a selected Veranstaltung template', async () => {
    const setReise = vi.fn();
    const user = userEvent.setup();
    render(<ReiseStep state={baseState} setReise={setReise} />);
    const select = screen.getByLabelText(/^Veranstaltung \(Vorlage\)/);
    const first = VERANSTALTUNGEN[0];
    await user.selectOptions(select, first.id);
    expect(setReise).toHaveBeenCalledWith({ anlass: first.anlass, ziel: first.ziel });
  });

  it('has no axe violations', async () => {
    const { container } = render(<ReiseStep state={baseState} setReise={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
