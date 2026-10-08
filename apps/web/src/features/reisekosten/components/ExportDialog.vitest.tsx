import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { defaultAuswahl, ExportKonfiguration, type ExportAuswahl } from './ExportDialog';

import type { BelegMeta } from '@gruenerator/contracts';

const beleg = (id: string, kategorie: BelegMeta['kategorie']): BelegMeta => ({
  id,
  dateiname: `${id}.pdf`,
  mimeType: 'application/pdf',
  groesse: 1,
  sha256: id,
  kategorie,
  betrag: 10,
  datum: null,
  von: null,
  nach: null,
  businessPackage: null,
  quelle: 'lokal',
});

function Harness({
  belege,
  lokal,
  tage,
  onAuswahl,
}: {
  belege: BelegMeta[];
  lokal: Set<string>;
  tage: number;
  onAuswahl: (a: ExportAuswahl) => void;
}) {
  const [auswahl, setAuswahl] = useState(() => defaultAuswahl(belege, lokal));
  return (
    <ExportKonfiguration
      auswahl={auswahl}
      setAuswahl={(a) => {
        setAuswahl(a);
        onAuswahl(a);
      }}
      belege={belege}
      lokaleDateien={lokal}
      tage={tage}
    />
  );
}

describe('ExportKonfiguration', () => {
  it('lists belege in form order and preselects those on this device', () => {
    render(
      <Harness
        belege={[beleg('hotel', 'hotelrechnung'), beleg('ticket', 'db_ticket')]}
        lokal={new Set(['hotel'])}
        tage={1}
        onAuswahl={() => {}}
      />
    );
    const boxes = screen.getAllByRole('checkbox', { name: /Bahn|Übernachtung/ });
    expect(boxes[0]).toHaveAccessibleName(/1.1 Bahn · DB-Ticket/);
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).toBeChecked();
    expect(screen.getByText('Datei liegt nicht auf diesem Gerät')).toBeInTheDocument();
  });

  it('offers the day table only beyond four days and lets the notes page be added', async () => {
    let last: ExportAuswahl | null = null;
    const { rerender } = render(
      <Harness belege={[]} lokal={new Set()} tage={2} onAuswahl={(a) => (last = a)} />
    );
    expect(screen.queryByRole('checkbox', { name: /Tagesaufstellung/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: /Abrechnungshinweise/ }));
    expect(last).toMatchObject({ optionen: { hinweise: true } });

    rerender(<Harness belege={[]} lokal={new Set()} tage={6} onAuswahl={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /Tagesaufstellung/ })).toBeChecked();
  });
});
