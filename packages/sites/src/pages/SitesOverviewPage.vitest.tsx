import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  list: { current: {} as Record<string, unknown> },
  projects: { current: [] as Array<{ isAdmin: boolean }> },
}));

vi.mock('../hooks/useSite', () => ({ useSiteList: () => hoisted.list.current }));
vi.mock('../hooks/useSiteSharing', () => ({
  useSiteProjects: () => ({ data: hoisted.projects.current }),
}));
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
    is_creator: true,
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
  beforeEach(() => {
    setList([]);
    hoisted.projects.current = [];
  });

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
      summary('kv', {
        group: { id: 'g1', name: 'Kreisverband' },
        role: 'editor',
        is_creator: false,
      }),
      summary('fremde', { role: 'viewer', is_creator: false }),
      summary('coadmin', { role: 'admin', is_creator: false }),
      summary('degradiert', { role: 'editor', is_creator: true }),
    ]);
    renderOverview();
    const own = screen.getByRole('region', { name: 'Meine Websites' });
    const projects = screen.getByRole('region', { name: 'Projekte' });
    const shared = screen.getByRole('region', { name: 'Mit mir geteilt' });
    expect(within(own).getByText('Seite eigene')).toBeInTheDocument();
    expect(within(projects).getByText('Seite kv')).toBeInTheDocument();
    expect(within(projects).getByText('Kreisverband')).toBeInTheDocument();
    expect(within(shared).getByText('Seite fremde')).toBeInTheDocument();
    // A co-admin did not create the site; a demoted creator still did.
    expect(within(shared).getByText('Seite coadmin')).toBeInTheDocument();
    expect(within(own).getByText('Seite degradiert')).toBeInTheDocument();
  });

  it('keeps a new site open at the limit for a project admin', () => {
    hoisted.projects.current = [{ isAdmin: true }];
    setList([summary('a1'), summary('a2')], 2);
    renderOverview();
    expect(screen.getByRole('button', { name: 'Neue Website' })).toBeEnabled();
  });

  it('does not count co-admin sites against the personal limit', () => {
    setList([summary('a1'), summary('b1', { is_creator: false })], 2);
    renderOverview();
    expect(screen.getByRole('button', { name: 'Neue Website' })).toBeEnabled();
  });
});
