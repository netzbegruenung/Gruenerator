import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { NotebookTile } from './ProjekteNotebooksSection';

import type { NotebookCollection } from '@/types/notebook';

import useSidebarFavouritesStore from '@/stores/sidebarFavouritesStore';

const shared = {
  id: 'nb-1',
  name: 'Klimaplan',
  access_source: 'group',
  shared_via_groups: ['Grüne NRW'],
} as NotebookCollection;

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
