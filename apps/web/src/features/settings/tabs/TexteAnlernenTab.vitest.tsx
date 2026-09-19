/**
 * Rezepte sind in die Agentura umgezogen — dieser Tab ist nur noch ein
 * Hinweis mit Link dorthin. Smoke test: der Hinweis rendert, der Link führt
 * auf `/agentura?cat=meine`, und die Karte ist a11y-sauber.
 */
import { describe, expect, it } from 'vitest';

import TexteAnlernenTab from './TexteAnlernenTab';

import { axe, renderWithProviders, screen } from '@/test-utils';

describe('TexteAnlernenTab', () => {
  it('zeigt den Hinweis mit Link zur Agentura und passt axe', async () => {
    const { container } = renderWithProviders(<TexteAnlernenTab />);

    expect(screen.getByText('Rezepte sind in die Agentura umgezogen.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Zur Agentura' });
    expect(link).toHaveAttribute('href', '/agentura?cat=meine');

    expect(await axe(container)).toHaveNoViolations();
  });
});
