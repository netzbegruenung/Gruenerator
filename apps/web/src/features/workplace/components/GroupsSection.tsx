import { SectionHeader } from '@gruenerator/ui';
import React, { memo, useCallback, useMemo } from 'react';
import { HiUserGroup } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import ToolGrid from '../../../components/common/ToolGrid';
import { useGroups } from '../../groups/hooks/useGroups';

import type { ToolEntry } from '../../../components/common/ToolGrid';

const GroupsSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const { userGroups, createGroup, isCreatingGroup } = useGroups({ isActive: true });

  const tools: ToolEntry[] = useMemo(
    () =>
      (userGroups || []).map((g) => {
        const entry: ToolEntry = {
          id: g.id,
          title: g.name,
          description: 'Gruppe',
          path: `/gruppen/${g.id}`,
          icon: HiUserGroup,
        };
        return entry;
      }),
    [userGroups]
  );

  const handleCreate = useCallback(() => {
    createGroup('Neue Gruppe', {
      onSuccess: (group) => navigate(`/gruppen/${group.id}`),
    });
  }, [createGroup, navigate]);

  const handleShare = useCallback((id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/gruppen/${id}`);
  }, []);

  return (
    <section className="mb-xl">
      <SectionHeader
        title="Gruppen"
        onCreate={handleCreate}
        createLabel={isCreatingGroup ? 'Wird erstellt...' : 'Neue Gruppe erstellen'}
      />
      {tools.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Noch keine Gruppen vorhanden.
        </p>
      ) : (
        <ToolGrid tools={tools} columns={3} compact showFavourites onShare={handleShare} />
      )}
    </section>
  );
});

GroupsSection.displayName = 'GroupsSection';

export default GroupsSection;
