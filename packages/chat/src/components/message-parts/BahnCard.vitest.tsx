import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BahnCard } from './BahnCard';

import type { BahnEntry, BahnPayload } from '@gruenerator/contracts';

function entry(over: Partial<BahnEntry> = {}): BahnEntry {
  return {
    id: 'e1',
    category: 'RE',
    number: '8',
    line: 'RE8',
    departureTime: '09:14',
    departurePlatform: '3',
    arrivalTime: null,
    arrivalPlatform: null,
    destination: 'Hamburg Hbf',
    via: ['Wittenberge'],
    ...over,
  };
}

function payload(over: Partial<BahnPayload> = {}): BahnPayload {
  return {
    kind: 'timetable',
    station: 'Berlin Hbf',
    date: '2026-07-17',
    hour: '09',
    entries: [entry()],
    ...over,
  };
}

describe('BahnCard', () => {
  it('renders the station and a departure row with its train label + destination', () => {
    render(<BahnCard data={payload()} />);
    // Accessible group name pins the aria-label wiring.
    expect(
      screen.getByRole('group', { name: /Deutsche Bahn: Abfahrten Berlin Hbf/ })
    ).toBeInTheDocument();
    expect(screen.getByText('RE8')).toBeInTheDocument();
    expect(screen.getByText('Hamburg Hbf')).toBeInTheDocument();
    expect(screen.getByText('09:14')).toBeInTheDocument();
  });

  it('falls back to "category number" when line is null', () => {
    render(
      <BahnCard
        data={payload({ entries: [entry({ line: null, category: 'ICE', number: '571' })] })}
      />
    );
    expect(screen.getByText('ICE 571')).toBeInTheDocument();
  });

  it('shows the empty state when there are no departures', () => {
    render(<BahnCard data={payload({ entries: [] })} />);
    expect(screen.getByText(/Keine Züge im abgefragten Zeitfenster gefunden/)).toBeInTheDocument();
  });

  it('caps the list at 8 rows and reports the remainder', () => {
    const entries = Array.from({ length: 11 }, (_, i) =>
      entry({ id: `e${i}`, destination: `Ziel ${i}` })
    );
    render(<BahnCard data={payload({ entries })} />);
    // Only the first 8 destinations render...
    expect(screen.getByText('Ziel 0')).toBeInTheDocument();
    expect(screen.getByText('Ziel 7')).toBeInTheDocument();
    expect(screen.queryByText('Ziel 8')).not.toBeInTheDocument();
    // ...and the overflow count is surfaced.
    expect(screen.getByText('+ 3 weitere Züge')).toBeInTheDocument();
  });

  it('formats a valid ISO date and omits the date chip when null', () => {
    const { rerender } = render(<BahnCard data={payload({ date: '2026-07-17' })} />);
    // toLocaleDateString('de-DE', …) — assert the year is present as a formatting smoke check.
    expect(screen.getByText(/2026/)).toBeInTheDocument();

    rerender(<BahnCard data={payload({ date: null })} />);
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });
});
