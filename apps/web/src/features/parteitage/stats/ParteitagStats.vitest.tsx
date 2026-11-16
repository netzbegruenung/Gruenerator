import { type ConventionSpeechPublic, type ConventionStatsV1 } from '@gruenerator/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { type ParteitagFilters } from './aggregate';
import { ParteitagStats } from './ParteitagStats';

const stats = {
  gesamt: { n: 2, topWoerter: [], anrede: [] },
  liste: { bloecke: [] },
  vergleichRaum: [
    { art: 'ergebnis', kategorie: 'Ergebnis', a: 0.9, na: 10, b: 0.8, nb: 12, p: 0.012, q: 0.29 },
    { art: 'ergebnis', kategorie: 'Dauer', a: 1, na: 10, b: 2, nb: 12, p: 0.001, q: 0.01 },
  ],
  signaturRaum: { kreis: [['Heimat', 5, 2, 3]] },
  methodik: [{ titel: 'Datenbasis', text: 'Alle Reden des Parteitags.' }],
  grenzen: 'Kleine Gruppen.',
} as unknown as ConventionStatsV1;

function speech(id: string, topic: string): ConventionSpeechPublic {
  return {
    id,
    slug: id,
    key: id,
    day: '2026-11-14',
    dayLabel: 'Samstag',
    listPlace: 1,
    seatType: 'offen',
    firstName: 'A',
    lastName: 'B',
    kv: 'KV',
    area: 'kreis',
    contested: false,
    elected: true,
    resultPercent: 90,
    deliveredBy: null,
    topic,
    durationS: 100,
    wordCount: 100,
    analysis: {
      anrede: 'Liebe Freund*innen',
      schluss: [],
      nennungen: {},
      signatur: '',
      wpm: null,
      woerter: 100,
      vorgetragen: false,
    },
    reelUrl: '',
    posterUrl: '',
  } as ConventionSpeechPublic;
}

const none: ParteitagFilters = {
  area: null,
  seatType: null,
  topic: null,
  day: null,
  outcome: null,
  kreis: null,
};
const speeches = [speech('1', 'Klima'), speech('2', 'Verkehr')];

describe('ParteitagStats', () => {
  it('click on topic bar sets topic filter', async () => {
    const onFilter = vi.fn();
    render(<ParteitagStats stats={stats} speeches={speeches} filters={none} onFilter={onFilter} />);
    await userEvent.click(screen.getByRole('button', { name: /Klima/ }));
    expect(onFilter).toHaveBeenCalledWith({ topic: 'Klima' });
  });

  it('group comparison hidden when filtered', async () => {
    const onFilter = vi.fn();
    const { rerender } = render(
      <ParteitagStats stats={stats} speeches={speeches} filters={none} onFilter={onFilter} />
    );
    expect(screen.getByText(/Vergleich kreisfreie Stadt und Kreis/)).toBeInTheDocument();
    expect(screen.getByText('Heimat', { exact: false })).toBeInTheDocument();
    rerender(
      <ParteitagStats
        stats={stats}
        speeches={speeches}
        filters={{ ...none, topic: 'Klima' }}
        onFilter={onFilter}
      />
    );
    expect(screen.queryByText(/Vergleich kreisfreie Stadt und Kreis/)).not.toBeInTheDocument();
    expect(screen.queryByText('Heimat', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('Gilt für alle Reden, nicht für die Auswahl')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(onFilter).toHaveBeenCalledWith(none);
  });

  it('marks Hinweis vs belastbar', () => {
    render(<ParteitagStats stats={stats} speeches={speeches} filters={none} onFilter={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Hinweis');
    expect(rows[2]).toHaveTextContent('belastbar');
  });

  it('renders methodik from stats', () => {
    render(<ParteitagStats stats={stats} speeches={speeches} filters={none} onFilter={vi.fn()} />);
    expect(screen.getByText('Datenbasis')).toBeInTheDocument();
    expect(screen.getByText('Alle Reden des Parteitags.')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <ParteitagStats stats={stats} speeches={speeches} filters={none} onFilter={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
