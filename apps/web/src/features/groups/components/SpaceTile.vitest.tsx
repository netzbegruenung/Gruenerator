import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { SpaceTile } from './SpaceTile';

import type { GroupSummary } from '@gruenerator/shared/groups';

const personalSpace: GroupSummary = {
  id: 'space-1',
  name: 'Mein Projekt',
  role: 'admin',
  isAdmin: true,
  group_type: 'personal',
};

const teamSpace: GroupSummary = {
  id: 'space-2',
  name: 'Grüne NRW',
  role: 'member',
  isAdmin: false,
  group_type: 'standard',
  member_count: 3,
};

describe('SpaceTile', () => {
  it('links to the group path built from the space', () => {
    renderWithProviders(<SpaceTile space={personalSpace} />);
    expect(screen.getByRole('link', { name: /Mein Projekt/ })).toHaveAttribute(
      'href',
      '/projekte/space-1'
    );
  });

  it('shows "Nur für dich" for a personal space', () => {
    renderWithProviders(<SpaceTile space={personalSpace} />);
    expect(screen.getByText('Nur für dich')).toBeInTheDocument();
  });

  it('shows the pluralized member count for a team space', () => {
    renderWithProviders(<SpaceTile space={teamSpace} />);
    expect(screen.getByText('3 Mitglieder')).toBeInTheDocument();
  });

  it('shows singular "Mitglied" for exactly one member', () => {
    renderWithProviders(<SpaceTile space={{ ...teamSpace, member_count: 1 }} />);
    expect(screen.getByText('1 Mitglied')).toBeInTheDocument();
  });

  it('falls back to the admin/member role label when member_count is absent', () => {
    renderWithProviders(
      <SpaceTile space={{ ...teamSpace, member_count: undefined, isAdmin: true }} />
    );
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders initials when there is no avatar_url', () => {
    renderWithProviders(<SpaceTile space={personalSpace} />);
    expect(screen.getByText('MP')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<SpaceTile space={teamSpace} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
