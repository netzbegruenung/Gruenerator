import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ list: { current: {} as Record<string, unknown> } }));

vi.mock('../hooks/useSite', () => ({ useSiteList: () => hoisted.list.current }));
vi.mock('../SitesContext', () => ({
  FROM_OVERVIEW_STATE: { fromOverview: true },
  useSitesPaths: () => ({
    overview: '/sites',
    create: '/sites/neu',
    site: (handle: string) => `/sites/${handle}`,
  }),
}));

import { SitesOverviewPage } from './SitesOverviewPage';

function summary(subdomain: string, over: Record<string, unknown> = {}) {
  return {
    id: subdomain,
    subdomain,
    site_title: `Seite ${subdomain}`,
    is_published: false,
    last_published: null,
    moderation: 'ok',
    updated_at: '2026-11-20T10:00:00Z',
    profile_image: null,
    theme: null,
    role: 'admin',
    group: null,
    ...over,
  };
}

function setList(sites: unknown[] | null, limit = 25) {
  hoisted.list.current = {
    sites,
    publicOrigin: 'https://grsites.de',
    limit,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };
}

function Where() {
  const location = useLocation();
  const state = location.state as { fromOverview?: boolean } | null;
  return (
    <span data-testid="pfad" data-from-overview={String(state?.fromOverview === true)}>
      {location.pathname}
    </span>
  );
}

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/sites']}>
      <Routes>
        <Route path="/sites" element={<SitesOverviewPage />} />
        <Route path="/sites/:handle" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SitesOverviewPage', () => {
  beforeEach(() => setList([]));

  it('lists every site with its address and status, linking to its editor', async () => {
    setList([
      summary('anna'),
      summary('anna-wien', { is_published: true }),
      summary('anna-alt', { moderation: 'hidden' }),
    ]);
    renderOverview();
    expect(screen.getByText('3 von 25')).toBeInTheDocument();
    expect(screen.getByText('grsites.de/anna-wien')).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.getByText('Veröffentlicht')).toBeInTheDocument();
    expect(screen.getByText('Ausgeblendet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /Seite anna-wien/ }));
    const where = screen.getByTestId('pfad');
    expect(where).toHaveTextContent('/sites/anna-wien');
    expect(where).toHaveAttribute('data-from-overview', 'true');
  });

  it('opens the create flow from the button', async () => {
    setList([summary('anna')]);
    renderOverview();
    await userEvent.click(screen.getByRole('button', { name: 'Neue Website' }));
    expect(screen.getByTestId('pfad')).toHaveTextContent('/sites/neu');
  });

  it('goes straight to creating when there is no site yet', () => {
    setList([]);
    renderOverview();
    const where = screen.getByTestId('pfad');
    expect(where).toHaveTextContent('/sites/neu');
    expect(where).toHaveAttribute('data-from-overview', 'false');
  });

  it('disables a new site at the limit', () => {
    setList([summary('a1'), summary('a2')], 2);
    renderOverview();
    expect(screen.getByRole('button', { name: 'Neue Website' })).toBeDisabled();
    expect(screen.getByText(/Höchstzahl an Websites/)).toBeInTheDocument();
  });

  it('sorts sites into own, project and shared sections', () => {
    setList([
      summary('eigene'),
      summary('kv', { group: { id: 'g1', name: 'Kreisverband' }, role: 'editor' }),
      summary('fremde', { role: 'viewer' }),
    ]);
    renderOverview();
    const own = screen.getByRole('region', { name: 'Meine Websites' });
    const projects = screen.getByRole('region', { name: 'Projekte' });
    const shared = screen.getByRole('region', { name: 'Mit mir geteilt' });
    expect(within(own).getByText('Seite eigene')).toBeInTheDocument();
    expect(within(projects).getByText('Seite kv')).toBeInTheDocument();
    expect(within(projects).getByText('Kreisverband')).toBeInTheDocument();
    expect(within(shared).getByText('Seite fremde')).toBeInTheDocument();
  });
});
