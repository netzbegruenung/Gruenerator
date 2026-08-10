import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AiConsentGate from './AiConsentGate';

import { useAuthStore } from '@/stores/authStore';

/**
 * Geprüft wird, was die Einwilligung wirksam macht — nicht das Aussehen des
 * Dialogs.
 *
 * Der Test hat einen konkreten Anlass: die E2E-Fixtures geben dem
 * Bypass-Nutzer inzwischen einen festen `ai_consent_at`, weil der modale Dialog
 * sonst in jedem ARIA-Snapshot `main` leerräumt. Damit sieht kein Playwright-Lauf
 * das Gate je wieder — die Abdeckung muss also hier liegen.
 */

vi.mock('@/stores/authStore', () => ({ useAuthStore: vi.fn() }));

const setAiConsent = vi.fn().mockResolvedValue(true);
const logout = vi.fn().mockResolvedValue(undefined);

function mockStore(state: Record<string, unknown>): void {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: Record<string, unknown>) => unknown)({
      setAiConsent,
      logout,
      ...state,
    })
  );
}

const renderGate = () =>
  render(
    <MemoryRouter>
      <AiConsentGate />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiConsentGate', () => {
  // Über den Titel statt über role="dialog": `getByRole` rechnet für jede
  // Abfrage den Accessibility-Tree des Portals samt aria-hidden-Geschwistern
  // durch und lief hier in den Test-Timeout.
  const title = () => screen.queryByText('Bevor es losgeht: Deine Einwilligung');

  it('bleibt weg, wenn die Einwilligung vorliegt', () => {
    mockStore({ isAuthenticated: true, user: { ai_consent_at: '2026-01-01T00:00:00.000Z' } });
    renderGate();
    expect(title()).toBeNull();
  });

  it('bleibt weg, solange niemand angemeldet ist', () => {
    mockStore({ isAuthenticated: false, user: null });
    renderGate();
    expect(title()).toBeNull();
  });

  it('fragt, sobald die Einwilligung fehlt', () => {
    mockStore({ isAuthenticated: true, user: { ai_consent_at: null } });
    renderGate();
    expect(title()).toBeInTheDocument();
  });

  // Der Kern von Art. 9 Abs. 2 lit. a: die Einwilligung muss ausdrücklich sein.
  // Ein Bestätigen-Knopf, der ohne gesetzten Haken feuert, wäre genau das nicht.
  it('bestätigt erst nach dem Haken', async () => {
    const user = userEvent.setup();
    mockStore({ isAuthenticated: true, user: { ai_consent_at: null } });
    renderGate();

    const confirm = screen.getByRole('button', { name: /Einwilligen und fortfahren/ });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(setAiConsent).toHaveBeenCalledWith(true);
  });

  // Ohne erreichbaren Ausgang wäre die Einwilligung nicht freiwillig
  // (Art. 7 Abs. 4 DSGVO). Der Fokus-Trap des modalen Dialogs sperrt den
  // Abmelden-Knopf der Seitenleiste aus, also muss einer hier drin stehen.
  it('lässt sich ohne Einwilligung verlassen', async () => {
    const user = userEvent.setup();
    mockStore({ isAuthenticated: true, user: { ai_consent_at: null } });
    renderGate();

    await user.click(screen.getByRole('button', { name: /abmelden/i }));
    expect(logout).toHaveBeenCalled();
    expect(setAiConsent).not.toHaveBeenCalled();
  });
});
