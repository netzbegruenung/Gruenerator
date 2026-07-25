import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BundestagCard } from './BundestagCard';

import type { BundestagPayload, BtVorgang } from '@gruenerator/contracts';

const metadata: BundestagPayload['metadata'] = {
  query: 'test',
  extractedName: null,
  matchedDokumentnummer: null,
  fetchTimeMs: 12,
};

function vorgang(over: Partial<BtVorgang> = {}): BtVorgang {
  return {
    id: 'v1',
    titel: 'Gesetz zum Klimaschutz',
    vorgangstyp: 'Gesetzgebung',
    beratungsstand: 'Angenommen',
    datum: '2026-05-01',
    ...over,
  };
}

function topicPayload(vorgaenge: BtVorgang[]): BundestagPayload {
  return {
    kind: 'topic',
    topic: { hits: [], speeches: [], documents: [], vorgaenge },
    notes: [],
    metadata,
  };
}

describe('BundestagCard', () => {
  it('renders the empty state for kind "none"', () => {
    render(<BundestagCard data={{ kind: 'none', notes: [], metadata }} />);
    expect(
      screen.getByText(/keine passenden Dokumente, Reden oder Abgeordneten/)
    ).toBeInTheDocument();
    // Header title falls back to the neutral "Bundestag (DIP)".
    expect(screen.getByRole('group', { name: /Bundestag: Bundestag \(DIP\)/ })).toBeInTheDocument();
  });

  it('derives the person header title with fraktion', () => {
    render(
      <BundestagCard
        data={{
          kind: 'person',
          person: {
            person: {
              id: 'p1',
              name: 'Ada Beispiel',
              fraktion: 'BÜNDNIS 90/DIE GRÜNEN',
              wahlperiode: 21,
            },
            aktivitaeten: [],
            speeches: [],
          },
          notes: [],
          metadata,
        }}
      />
    );
    expect(screen.getByText('Ada Beispiel (BÜNDNIS 90/DIE GRÜNEN)')).toBeInTheDocument();
    expect(screen.getByText(/Wahlperiode 21/)).toBeInTheDocument();
  });

  describe('verfahrensPill (Beratungsstand → colour class)', () => {
    // The pill maps free DIP text onto a status colour via regex; pin each branch.
    it.each([
      ['Angenommen', 'text-green-700'],
      ['Abgelehnt', 'text-red-700'],
      ['Überwiesen', 'text-amber-700'],
      ['Krude Zwischenlage', 'text-foreground-muted'],
    ])('classes %s as %s', (beratungsstand, expectedClass) => {
      render(<BundestagCard data={topicPayload([vorgang({ beratungsstand })])} />);
      const pill = screen.getByText(beratungsstand);
      expect(pill.className).toContain(expectedClass);
    });

    it('labels a null Beratungsstand as "unbekannt" with the neutral class', () => {
      render(<BundestagCard data={topicPayload([vorgang({ beratungsstand: null })])} />);
      const pill = screen.getByText('unbekannt');
      expect(pill.className).toContain('text-foreground-muted');
    });
  });
});
