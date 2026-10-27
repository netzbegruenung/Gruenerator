import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TabelleAuswertenToolUI } from './TabelleAuswertenToolUI';

const args = { auftrag: 'Summe der Spenden je Kreisverband', modus: 'auswerten' };

describe('TabelleAuswertenToolUI', () => {
  it('zeigt den Auftrag und läuft, solange kein Ergebnis da ist', () => {
    render(<TabelleAuswertenToolUI args={args} />);
    expect(screen.getByText('Summe der Spenden je Kreisverband')).toBeInTheDocument();
    expect(screen.getByText('wird ausgeführt…')).toBeInTheDocument();
  });

  it('legt den erzeugten Code aus dem Ergebnis hinter „Code anzeigen"', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TabelleAuswertenToolUI
        args={args}
        result={{ ergebnis: { summe: 42 }, dateien: [], code: 'print(42)' }}
      />
    );
    expect(screen.getByText('abgeschlossen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Code anzeigen' }));
    // Shiki zerlegt den Code in Token-Spans — deshalb auf den Text der Karte.
    expect(container.textContent).toContain('print(42)');
  });

  it('meldet einen Fehlschlag', () => {
    render(
      <TabelleAuswertenToolUI args={args} result={{ error: 'KeyError: Spalte', code: 'x' }} />
    );
    expect(screen.getByText('fehlgeschlagen')).toBeInTheDocument();
    expect(screen.getByText('KeyError: Spalte')).toBeInTheDocument();
  });
});
