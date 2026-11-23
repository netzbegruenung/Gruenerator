import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjektTile } from './ProjektTile';

import type { GroupSummary } from '@gruenerator/shared/groups';

import useSidebarFavouritesStore from '@/stores/sidebarFavouritesStore';

const personalProjekt: GroupSummary = {
  id: 'projekt-1',
  name: 'Mein Projekt',
  role: 'admin',
  isAdmin: true,
  group_type: 'personal',
};

const teamProjekt: GroupSummary = {
  id: 'projekt-2',
  name: 'Grüne NRW',
  role: 'member',
  isAdmin: false,
  group_type: 'standard',
  member_count: 3,
};

describe('ProjektTile', () => {
  it('links to the group path built from the projekt', () => {
    renderWithProviders(<ProjektTile projekt={personalProjekt} />);
    expect(screen.getByRole('link', { name: /Mein Projekt/ })).toHaveAttribute(
      'href',
      '/projekte/projekt-1'
    );
  });

  it('shows the description but no member count or activity date', () => {
    renderWithProviders(
      <ProjektTile
        projekt={{
          ...teamProjekt,
          description: 'Wahlkampf 2027',
          last_activity_at: '2026-11-22T10:00:00Z',
        }}
      />
    );
    expect(screen.getByText('Wahlkampf 2027')).toBeInTheDocument();
    expect(screen.queryByText(/Mitglied/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gestern|Vor /)).not.toBeInTheDocument();
  });

  it('offers favourites to everyone and archiving only to admins', async () => {
    const { user, unmount } = renderWithProviders(<ProjektTile projekt={teamProjekt} />);
    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    expect(await screen.findByRole('menuitem', { name: /Zu Favoriten/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Archivieren/ })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<ProjektTile projekt={{ ...teamProjekt, isAdmin: true }} />);
    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    expect(await screen.findByRole('menuitem', { name: /Archivieren/ })).toBeInTheDocument();
  });

  it('puts the project into the sidebar favourites', async () => {
    const { user } = renderWithProviders(<ProjektTile projekt={teamProjekt} />);
    await user.click(screen.getByRole('button', { name: 'Aktionen' }));
    await user.click(await screen.findByRole('menuitem', { name: /Zu Favoriten/ }));
    expect(useSidebarFavouritesStore.getState().favouriteIds).toContain('projekt:projekt-2');
  });

  it('renders initials when there is no avatar_url', () => {
    renderWithProviders(<ProjektTile projekt={personalProjekt} />);
    expect(screen.getByText('MP')).toBeInTheDocument();
  });

  it('loads the avatar from the group avatar endpoint, not the stored filename', () => {
    const { container } = renderWithProviders(
      <ProjektTile projekt={{ ...teamProjekt, avatar_url: 'projekt-2-1700000000000.webp' }} />
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/auth/groups/projekt-2/avatar?v=projekt-2-1700000000000.webp'
    );
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<ProjektTile projekt={teamProjekt} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a chosen colour through the audited palette variables', () => {
    renderWithProviders(<ProjektTile projekt={{ ...teamProjekt, color: 'gruen' }} />);
    const card = screen.getByRole('link', { name: /Grüne NRW/ }).parentElement!;
    expect(card.style.getPropertyValue('--tile-bg')).toBe('#DDEFD9');
    expect(card.style.getPropertyValue('--tile-title-dark')).toBe('#A9D8AC');
  });

  it('ignores an unknown colour key and keeps the default tile', () => {
    renderWithProviders(<ProjektTile projekt={{ ...teamProjekt, color: 'neon' }} />);
    const card = screen.getByRole('link', { name: /Grüne NRW/ }).parentElement!;
    expect(card.style.getPropertyValue('--tile-bg')).toBe('');
  });

  it('marks an archived projekt in the meta line', () => {
    renderWithProviders(
      <ProjektTile projekt={{ ...teamProjekt, archived_at: '2026-11-22T10:00:00Z' }} />
    );
    expect(screen.getByText('Archiviert')).toBeInTheDocument();
  });
});
