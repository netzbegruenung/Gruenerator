import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { VerpflegungUebernachtungStep } from './VerpflegungUebernachtungStep';

import type { ComputeResult, ReisekostenState } from '@gruenerator/contracts';

const baseState: ReisekostenState = {
  rateKey: 'de-DE/nrw',
  stammdaten: { name: '', strasse: '', hausnr: '', plz: '', ort: '', email: '', iban: '' },
  reise: { anlass: '', ziel: '', reisebeginn: '2026-03-01T08:00', rueckkehr: '2026-03-02T18:00' },
  fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
  verpflegungAbzuege: [],
  uebernachtung: null,
  spende: 0,
};

const computed: ComputeResult = {
  fahrtkosten: { bahn: 0, oepnv: 0, kfz: 0, miete: 0, taxi: 0, sonstiges: 0, summe: 0 },
  verpflegung: {
    tage: [
      { datum: '2026-03-01', typ: 'anreise', basis: 14, abzug: 0, summe: 14 },
      { datum: '2026-03-02', typ: 'abreise', basis: 14, abzug: 0, summe: 14 },
    ],
    summe: 28,
  },
  uebernachtung: { summe: 0 },
  gesamt: 28,
  spende: 0,
  auszahlung: 28,
};

describe('VerpflegungUebernachtungStep', () => {
  it('shows a prompt to fill in the Reisezeitraum when dates are missing', () => {
    render(
      <VerpflegungUebernachtungStep
        state={{ ...baseState, reise: { ...baseState.reise, reisebeginn: '', rueckkehr: '' } }}
        belege={[]}
        update={vi.fn()}
        onToggle={vi.fn()}
        onBeleg={vi.fn()}
        computed={computed}
      />
    );
    expect(screen.getByText(/Reisebeginn/)).toBeInTheDocument();
    expect(screen.queryByText('28,00 €')).not.toBeInTheDocument();
  });

  it('renders the computed Verpflegungspauschale once a Reisezeitraum is set', () => {
    render(
      <VerpflegungUebernachtungStep
        state={baseState}
        belege={[]}
        update={vi.fn()}
        onToggle={vi.fn()}
        onBeleg={vi.fn()}
        computed={computed}
      />
    );
    expect(screen.getByText('28,00 €', { selector: 'span.text-3xl' })).toBeInTheDocument();
  });

  it('calls onToggle with the flipped meal flag when a MealChip is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <VerpflegungUebernachtungStep
        state={baseState}
        belege={[]}
        update={vi.fn()}
        onToggle={onToggle}
        onBeleg={vi.fn()}
        computed={computed}
      />
    );
    const breakfastButtons = screen.getAllByRole('button', { name: /Frühstück/ });
    await user.click(breakfastButtons[0]);
    expect(onToggle).toHaveBeenCalledWith('2026-03-01', { fruehstueck: true });
  });

  it('adds an uebernachtung patch via the Switch toggle', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(
      <VerpflegungUebernachtungStep
        state={baseState}
        belege={[]}
        update={update}
        onToggle={vi.fn()}
        onBeleg={vi.fn()}
        computed={computed}
      />
    );
    await user.click(screen.getByRole('switch', { name: 'Übernachtung anfügen' }));
    const patch = update.mock.calls[0][0] as (s: ReisekostenState) => ReisekostenState;
    expect(patch(baseState).uebernachtung).toEqual({ modus: 'pauschal', betrag: null, naechte: 1 });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <VerpflegungUebernachtungStep
        state={baseState}
        belege={[]}
        update={vi.fn()}
        onToggle={vi.fn()}
        onBeleg={vi.fn()}
        computed={computed}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
