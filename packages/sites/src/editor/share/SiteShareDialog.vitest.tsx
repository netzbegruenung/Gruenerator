import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

const api = vi.hoisted(() => ({
  sites: {
    listSiteMembers: vi.fn(),
    listSiteGroups: vi.fn(),
    setSiteMemberRole: vi.fn(),
    removeSiteMember: vi.fn(),
    setSiteGroup: vi.fn(),
    removeSiteGroup: vi.fn(),
  },
  groups: { listUserGroups: vi.fn() },
}));

vi.mock('@gruenerator/shared/api', () => ({ getContractsClient: () => api }));
vi.mock('../../SitesContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { type SiteData } from '../../hooks/useSite';

import { SiteShareDialog } from './SiteShareDialog';

const site = { id: 's1', subdomain: 'anna' } as SiteData;

function setup(isProjectSite = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteShareDialog site={site} isProjectSite={isProjectSite} open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.sites.listSiteMembers.mockResolvedValue({
    status: 200,
    body: {
      members: [
        { userId: 'u1', displayName: 'Anna', role: 'admin', source: 'member', groupId: null },
        { userId: 'u2', displayName: 'Bert', role: 'editor', source: 'member', groupId: null },
      ],
    },
  });
  api.sites.listSiteGroups.mockResolvedValue({
    status: 200,
    body: { groups: [{ groupId: 'g1', name: 'Wahlkampfteam', write: true }] },
  });
  api.groups.listUserGroups.mockResolvedValue({
    status: 200,
    body: { groups: [{ id: 'g2', name: 'Kreisverband', isAdmin: true }] },
  });
});

describe('SiteShareDialog', () => {
  it('lists people and projects with their roles', async () => {
    setup();
    expect(await screen.findByRole('combobox', { name: 'Rolle von Bert' })).toHaveValue('editor');
    expect(screen.getByRole('combobox', { name: 'Zugriff für Wahlkampfteam' })).toHaveValue(
      'write'
    );
    expect(screen.getByRole('heading', { name: 'Projekte' })).toBeInTheDocument();
  });

  it('shows the last-admin hint when the server refuses the change', async () => {
    api.sites.setSiteMemberRole.mockResolvedValue({
      status: 409,
      body: { error: 'x', code: 'last_admin' },
    });
    setup();
    const select = await screen.findByRole('combobox', { name: 'Rolle von Anna' });
    await userEvent.selectOptions(select, 'viewer');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mindestens eine Person muss Admin bleiben.'
    );
  });

  it('hides the project section and asks nothing for a project site', async () => {
    setup(true);
    await screen.findByRole('combobox', { name: 'Rolle von Bert' });
    expect(screen.queryByRole('heading', { name: 'Projekte' })).not.toBeInTheDocument();
    expect(api.sites.listSiteGroups).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    setup();
    await screen.findByRole('combobox', { name: 'Rolle von Bert' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
