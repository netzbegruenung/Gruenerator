import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ list: { current: {} as Record<string, unknown> } }));

vi.mock('../hooks/useSite', () => ({ useSiteList: () => hoisted.list.current }));
vi.mock('../SitesContext', () => ({
  FROM_OVERVIEW_STATE: { fromOverview: true },
  useAuth: () => ({ user: { display_name: 'Anna Beispiel', locale: 'de-DE' } }),
  useSitesPaths: () => ({
    overview: '/sites',
    site: (handle: string) => `/sites/${handle}`,
  }),
}));
// The create flow has its own tests; here it only shows where it sits and whether it is locked.
vi.mock('../create/CreateFlow', () => ({
  CreateFlow: (p: { header: ReactNode; children: ReactNode; disabledReason: string | null }) => (
    <div>
      {p.header}
      <div data-testid="composer" data-locked={String(!!p.disabledReason)}>
        {p.disabledReason}
      </div>
      {p.children}
    </div>
  ),
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

    await userEvent.click(screen.getByRole('link', { name: 'Seite anna-wien bearbeiten' }));
    const where = screen.getByTestId('pfad');
    expect(where).toHaveTextContent('/sites/anna-wien');
    expect(where).toHaveAttribute('data-from-overview', 'true');
  });

  it('greets by first name above the composer once there are sites', () => {
    setList([summary('anna')]);
    renderOverview();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Deine Websites, Anna');
    expect(screen.getByTestId('composer')).toHaveAttribute('data-locked', 'false');
  });

  it('stays on the page without a site: the composer is the whole page', () => {
    setList([]);
    renderOverview();
    expect(screen.queryByTestId('pfad')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Deine Kandidat*innen-Seite'
    );
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('locks the composer at the limit and says why', () => {
    setList([summary('a1'), summary('a2')], 2);
    renderOverview();
    expect(screen.getByTestId('composer')).toHaveAttribute('data-locked', 'true');
    expect(screen.getByText(/Höchstzahl von 2 Websites/)).toBeInTheDocument();
  });
});
