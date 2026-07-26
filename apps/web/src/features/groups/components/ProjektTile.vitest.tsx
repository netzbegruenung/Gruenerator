import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjektTile } from './ProjektTile';

import type { GroupSummary } from '@gruenerator/shared/groups';

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

  it('shows "Nur für dich" for a personal projekt', () => {
    renderWithProviders(<ProjektTile projekt={personalProjekt} />);
    expect(screen.getByText('Nur für dich')).toBeInTheDocument();
  });

  it('shows the pluralized member count for a team projekt', () => {
    renderWithProviders(<ProjektTile projekt={teamProjekt} />);
    expect(screen.getByText('3 Mitglieder')).toBeInTheDocument();
  });

  it('shows singular "Mitglied" for exactly one member', () => {
    renderWithProviders(<ProjektTile projekt={{ ...teamProjekt, member_count: 1 }} />);
    expect(screen.getByText('1 Mitglied')).toBeInTheDocument();
  });

  it('falls back to the admin/member role label when member_count is absent', () => {
    renderWithProviders(
      <ProjektTile projekt={{ ...teamProjekt, member_count: undefined, isAdmin: true }} />
    );
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders initials when there is no avatar_url', () => {
    renderWithProviders(<ProjektTile projekt={personalProjekt} />);
    expect(screen.getByText('MP')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<ProjektTile projekt={teamProjekt} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
