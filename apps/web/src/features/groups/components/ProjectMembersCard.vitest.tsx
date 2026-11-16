import { type GroupMember } from '@gruenerator/shared/groups';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectMembersCard } from './ProjectMembersCard';

const member = (id: string, name: string): GroupMember =>
  ({ user_id: id, display_name: name, first_name: name, role: 'member' }) as GroupMember;

describe('ProjectMembersCard', () => {
  it('renders nothing for a single member', () => {
    const { container } = renderWithProviders(
      <ProjectMembersCard members={[member('1', 'Moritz')]} onShowMembers={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists members and keeps „Mitglieder verwalten“ reachable', async () => {
    const onShowMembers = vi.fn();
    const { user, container } = renderWithProviders(
      <ProjectMembersCard
        members={[member('1', 'Moritz'), member('2', 'Aileen')]}
        onShowMembers={onShowMembers}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Mitglieder verwalten' }));
    expect(onShowMembers).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
