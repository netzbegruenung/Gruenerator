import { describe, expect, it } from 'vitest';

import { SettingsList, SettingsListRow } from './SettingsListRow';

import { axe, render, screen } from '@/test-utils';

describe('SettingsListRow', () => {
  it('renders name, meta, badge, actions and the part below the row', () => {
    render(
      <SettingsList>
        <SettingsListRow
          id="test.row"
          mark="K"
          name="KV Musterstadt"
          meta="wolke.example.org"
          badge={{ label: 'Aktiv' }}
          actions={<button type="button">Öffnen</button>}
        >
          <p>Aufgeklappt</p>
        </SettingsListRow>
      </SettingsList>
    );
    expect(screen.getByText('KV Musterstadt')).toBeInTheDocument();
    expect(screen.getByText('wolke.example.org')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Öffnen' })).toBeInTheDocument();
    expect(screen.getByText('Aufgeklappt')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveAttribute('data-settings-id', 'test.row');
  });

  it('shows the empty text instead of the list', () => {
    render(
      <SettingsList isEmpty empty="Noch nichts da.">
        {null}
      </SettingsList>
    );
    expect(screen.getByText('Noch nichts da.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = render(
      <SettingsList>
        <SettingsListRow
          mark="K"
          name="Name"
          meta="Meta"
          badge={{ label: 'Neutral', tone: 'neutral' }}
        />
      </SettingsList>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
