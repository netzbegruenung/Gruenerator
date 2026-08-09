import { describe, expect, it, vi } from 'vitest';

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

describe('LoginPage (standalone)', () => {
  it('shows one primary provider and reveals the rest via "Anderer Anbieter"', async () => {
    const { user } = renderWithProviders(<LoginPage />, { route: '/login' });

    expect(screen.getByRole('button', { name: /anmelden/i })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /anderer anbieter/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent(/anbieter ausblenden/i);
    expect(screen.getByRole('list')).toBeInTheDocument();
    // All 4 LOGIN_PROVIDERS, not just the enabledByDefault subset. This
    // deliberately diverges from StartpageHero, which filters its expanded
    // list to enabledByDefault (plus the remembered/deep-linked primary):
    // /login is the fallback surface where every provider must stay reachable.
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('has no axe violations, collapsed or expanded', async () => {
    const { container, user } = renderWithProviders(<LoginPage />, { route: '/login' });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: /anderer anbieter/i }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
