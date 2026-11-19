import { render, screen } from '@testing-library/react';
import { Suspense, type ComponentType } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/authStore';

import { routes } from './routes';

vi.mock('../features/sites/SitesEditPage', () => ({
  default: () => <p>Sites-Editor</p>,
}));

const setUser = (user: Record<string, unknown> | null) =>
  useAuthStore.setState({ user: user as never });

const renderSitesRoute = () => {
  const Component = routes.find((r) => r.path === '/sites')?.component as ComponentType;
  render(
    <MemoryRouter>
      <Suspense fallback={null}>
        <Component />
      </Suspense>
    </MemoryRouter>
  );
};

beforeEach(() => setUser(null));

describe('/sites route gate', () => {
  it('shows the not-found page when the account is not unlocked', async () => {
    setUser({ id: 'u', sites_unlocked: null });
    renderSitesRoute();
    expect(await screen.findByText('Seite nicht gefunden')).toBeTruthy();
    expect(screen.queryByText('Sites-Editor')).toBeNull();
  });

  it('renders the editor for an unlocked account', async () => {
    setUser({ id: 'u', sites_unlocked: true });
    renderSitesRoute();
    expect(await screen.findByText('Sites-Editor')).toBeTruthy();
  });
});
