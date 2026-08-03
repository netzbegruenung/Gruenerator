import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { PersonStep } from './PersonStep';

import type { ReisekostenState } from '@gruenerator/contracts';

const baseState: ReisekostenState = {
  rateKey: 'de-DE/nrw',
  stammdaten: {
    name: 'Erika Mustermann',
    strasse: 'Hauptstraße',
    hausnr: '1',
    plz: '50667',
    ort: 'Köln',
    email: 'erika@example.com',
    iban: 'DE00 0000 0000 0000 0000 00',
  },
  reise: { anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' },
  fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
  verpflegungAbzuege: [],
  uebernachtung: null,
  spende: 0,
};

describe('PersonStep', () => {
  it('renders stammdaten values in their fields', () => {
    render(<PersonStep state={baseState} setStammdaten={vi.fn()} />);
    expect(screen.getByDisplayValue('Erika Mustermann')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Köln')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50667')).toBeInTheDocument();
  });

  it('calls setStammdaten with the patched field on input', async () => {
    const setStammdaten = vi.fn();
    const user = userEvent.setup();
    render(<PersonStep state={baseState} setStammdaten={setStammdaten} />);
    const ortInput = screen.getByDisplayValue('Köln');
    await user.type(ortInput, '!');
    expect(setStammdaten).toHaveBeenCalledWith({ ort: 'Köln!' });
  });

  it('renders an empty telefon field when telefon is undefined', () => {
    render(<PersonStep state={baseState} setStammdaten={vi.fn()} />);
    const telefon = screen.getByLabelText('Telefon') as HTMLInputElement;
    expect(telefon.value).toBe('');
  });

  it('has no axe violations', async () => {
    const { container } = render(<PersonStep state={baseState} setStammdaten={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
