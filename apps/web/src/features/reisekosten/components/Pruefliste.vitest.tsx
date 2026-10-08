import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import { HelpTip } from './HelpTip';
import { Pruefliste } from './Pruefliste';

describe('Pruefliste', () => {
  it('groups missing, uploaded and hints, and is accessible', async () => {
    const { container } = render(
      <Pruefliste
        punkte={[
          { id: 'a', status: 'fehlt', label: 'Kfz: Routenplaner-Ausdruck', posten: 'kfz' },
          { id: 'b', status: 'ok', label: 'Bahn: Originalbeleg', posten: 'bahn' },
          {
            id: 'c',
            status: 'hinweis',
            label: 'Hotelfrühstück',
            detail: 'nur bis 250 €',
            posten: 'uebernachtung',
          },
        ]}
        findings={[{ level: 'error', field: 'stammdaten.name', message: 'Name fehlt.' }]}
      />
    );
    expect(screen.getByRole('heading', { name: 'Noch auszufüllen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Noch einzureichen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hochgeladen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hotelfrühstück/ })).toHaveTextContent(
      'nur bis 250 €'
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says what will appear before anything is entered', () => {
    render(<Pruefliste punkte={[]} findings={[]} />);
    expect(screen.getByText(/welche Belege dazugehören/)).toBeInTheDocument();
  });
});

describe('HelpTip', () => {
  it('names its trigger and opens the NRW rule on click', async () => {
    const { container } = render(<HelpTip thema="kfz" />);
    const trigger = screen.getByRole('button', { name: 'Erklärung: 1.3 Kfz' });
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.setup().click(trigger);
    expect(await screen.findByText(/höchstens 500 km/)).toBeInTheDocument();
  });
});
