import { afterEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders, screen } from '../../../test-utils';

import LoginPage from './LoginPage';

// useInstantAuth (hooks/useAuth.ts) drives a React Query auth probe against
// the backend — mock it out so this test exercises the standalone screen's
// own primary-provider/toggle logic, not the auth-bootstrap network path.
vi.mock('../../../hooks/useAuth', () => ({
  useInstantAuth: () => ({
    loading: false,
    isAuthenticated: false,
    setLoginIntent: vi.fn(),
  }),
}));

/**
 * Die Zeitzone festnageln, denn seit 08/2026 hängt der Bildschirm daran:
 * `detectCountry()` liest sie, und ohne erkennbares Land rendert /login bewusst
 * zwei gleichrangige Länderknöpfe statt eines „Anmelden".
 *
 * Ohne diesen Griff misst der Test die Uhr des Rechners: lokal (Europe/Berlin)
 * war er grün, in CI (UTC) fiel er durch, weil dort zu Recht die Länderwahl
 * greift und kein Knopf mehr „Anmelden" heißt. Genau so ist er einmal
 * durchgefallen.
 */
function mitZeitzone(timeZone: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone }),
  } as unknown as Intl.DateTimeFormat);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginPage (standalone) — Land erkannt', () => {
  it('shows one primary provider and reveals the rest via "Anderer Anbieter"', async () => {
    mitZeitzone('Europe/Berlin');
    const { user } = renderWithProviders(<LoginPage />, { route: '/login' });

    expect(screen.getByRole('button', { name: /anmelden/i })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /anderer anbieter/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent(/anbieter ausblenden/i);
    expect(screen.getByRole('list')).toBeInTheDocument();
    // Nur die `enabledByDefault`-Anbieter — gleiche Regel wie StartpageHero.
    // Grünerator und Netzbegrünung sind Deeplink-Anbieter und tauchen hier
    // nicht auf; der Deeplink-Fall wird unten eigens geprüft.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /grünerator login/i })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('has no axe violations, collapsed or expanded', async () => {
    mitZeitzone('Europe/Berlin');
    const { container, user } = renderWithProviders(<LoginPage />, { route: '/login' });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: /anderer anbieter/i }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('LoginPage (standalone) — Deeplink-Anbieter', () => {
  // Der Grünerator-Login wird im Frontend nicht mehr angeboten; erreichbar
  // bleibt er über /login?login=gruenerator. Der Deeplink muss deshalb beides
  // tun: die Liste aufklappen UND den Anbieter darin zeigen.
  it('zeigt den Grünerator-Login nur über ?login=gruenerator', () => {
    mitZeitzone('Europe/Berlin');
    renderWithProviders(<LoginPage />, { route: '/login?login=gruenerator' });

    expect(screen.getByRole('button', { name: /anbieter ausblenden/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grünerator Login' })).toBeInTheDocument();
  });
});

describe('LoginPage (standalone) — Land unklar', () => {
  // Der Kern der Änderung: Bei unklarem Signal wird gefragt statt geraten. Ein
  // einzelner „Anmelden"-Knopf müsste sich für ein Land entscheiden, und diese
  // stille Entscheidung fiel bisher immer auf Deutschland — auch für
  // österreichische Mitglieder, deren Browser erwartungsgemäß Deutsch meldet.
  it('bietet beide Länder gleichrangig an, ohne ratenden Sammelknopf', () => {
    mitZeitzone('America/New_York');
    renderWithProviders(<LoginPage />, { route: '/login' });

    expect(screen.getByText('In welchem Land bist du grün aktiv?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deutschland' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Österreich' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^anmelden$/i })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    mitZeitzone('America/New_York');
    const { container } = renderWithProviders(<LoginPage />, { route: '/login' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
