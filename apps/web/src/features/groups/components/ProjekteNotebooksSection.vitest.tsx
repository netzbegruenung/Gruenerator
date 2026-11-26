import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { NotebookTile, ProjekteNotebooksSection } from './ProjekteNotebooksSection';

import type { NotebookCollection } from '@/types/notebook';

import useSidebarFavouritesStore from '@/stores/sidebarFavouritesStore';

const own = [{ id: 'nb-own', name: 'Haushalt', access_source: 'owned' }];
const savedItems = [
  {
    kind: 'notebook',
    key: 'notebook:nb-public',
    ref: 'nb-public',
    origin: 'oeffentlich',
    title: 'Verkehrswende',
    description: null,
    authorName: 'Kim',
    saved: true,
    notebook: { slug: 'verkehrswende-abc123' },
  },
  // Already listed as an own notebook: stays out of the saved tiles.
  { kind: 'notebook', key: 'notebook:nb-own', ref: 'nb-own', title: 'Haushalt', saved: true },
  // Already listed through the role: stays out of the saved tiles too.
  {
    kind: 'notebook',
    key: 'notebook:berlin-notebook',
    ref: 'berlin-notebook',
    origin: 'landesverband',
    title: 'Berlin',
    saved: true,
    notebook: { slug: 'berlin-notebook' },
  },
];

const lv = vi.hoisted(() => ({ ids: null as readonly string[] | null }));
vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUserLandesverbaende: () => ({ lvIds: lv.ids }),
}));

vi.mock('../../auth/hooks/useProfileData', () => ({
  useNotebookCollections: () => ({ query: { data: own, isLoading: false, isError: false } }),
}));
vi.mock('../../notebook/hooks/useSharedNotebookCollections', () => ({
  useSharedNotebookCollections: () => ({ data: [] }),
}));
vi.mock('@gruenerator/shared/marketplace', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMarketplaceKind: () => ({ items: savedItems, isLoading: false }),
}));

describe('ProjekteNotebooksSection', () => {
  it('lists notebooks saved in the marketplace next to the own ones, once each', () => {
    renderWithProviders(<ProjekteNotebooksSection />);
    expect(screen.getByRole('link', { name: /Verkehrswende/ })).toHaveAttribute(
      'href',
      '/notebooks/verkehrswende-abc123'
    );
    expect(screen.getByText('Gemerkt · von Kim')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Haushalt/ })).toHaveLength(1);
  });

  it('adds the Landesverband notebook of a matching role, once', () => {
    lv.ids = ['berlin'];
    renderWithProviders(<ProjekteNotebooksSection />);
    expect(screen.getAllByText('Dein Landesverband')).toHaveLength(1);
    // The saved copy of the same notebook would carry a bare „Gemerkt".
    expect(screen.queryByText('Gemerkt')).not.toBeInTheDocument();
    lv.ids = null;
  });

  it('adds no Landesverband notebook without a matching role', () => {
    lv.ids = [];
    renderWithProviders(<ProjekteNotebooksSection />);
    expect(screen.queryByText('Dein Landesverband')).not.toBeInTheDocument();
    lv.ids = null;
  });

  it('offers unsaving, and no sidebar favourite for a public saved notebook', async () => {
    const { user } = renderWithProviders(<ProjekteNotebooksSection />);
    const tile = screen.getByRole('link', { name: /Verkehrswende/ }).parentElement!;
    await user.click(within(tile).getByRole('button', { name: 'Aktionen' }));
    expect(await screen.findByRole('menuitem', { name: /Nicht mehr merken/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Zu Favoriten/ })).not.toBeInTheDocument();
  });
});

// Only the fields the tile reads; the full row type carries ~30 more.
const shared = {
  id: 'nb-1',
  name: 'Klimaplan',
  access_source: 'group',
  shared_via_groups: ['Grüne NRW'],
} as unknown as NotebookCollection;

describe('NotebookTile', () => {
  it('offers favourites on a shared notebook, without the owner actions', async () => {
    const { user } = renderWithProviders(<NotebookTile collection={shared} isOwn={false} />);
    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    expect(await screen.findByRole('menuitem', { name: /Zu Favoriten/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Löschen/ })).not.toBeInTheDocument();
  });

  it('puts the notebook into the sidebar favourites', async () => {
    const { user } = renderWithProviders(<NotebookTile collection={shared} isOwn={false} />);
    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    await user.click(await screen.findByRole('menuitem', { name: /Zu Favoriten/ }));
    expect(useSidebarFavouritesStore.getState().favouriteIds).toContain('notebook:nb-1');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<NotebookTile collection={shared} isOwn={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
