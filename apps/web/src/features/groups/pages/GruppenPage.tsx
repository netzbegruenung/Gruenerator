import { buildGroupPath } from '@gruenerator/shared/groups';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { SectionHeader, StatusBanner } from '@gruenerator/ui';
import { useState, useCallback, useRef } from 'react';
import { HiUserGroup } from 'react-icons/hi';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ToolGrid from '../../../components/common/ToolGrid';
import GroupDetailSection from '../components/GroupDetailSection';
import GroupsCreateSection from '../components/GroupsCreateSection';
import PublicGroupsSection from '../components/PublicGroupsSection';
import { useGroupResolver } from '../hooks/useGroupResolver';
import { useGroups, type GroupSummary } from '../hooks/useGroups';

import type { ToolEntry } from '../../../components/common/ToolGrid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GruppenPage = () => {
  const navigate = useNavigate();
  const { idOrSlug } = useParams<{ idOrSlug?: string }>();
  const isUuid = !!idOrSlug && UUID_RE.test(idOrSlug);
  // Only hit the backend resolver for slug-shaped inputs; UUIDs render directly
  // so legacy /gruppen/<uuid> links keep working with zero latency.
  const groupResolver = useGroupResolver(
    idOrSlug ?? '',
    !!idOrSlug && !isUuid && extractSlugSuffix(idOrSlug) !== null
  );
  const resolvedGroupId = isUuid ? idOrSlug : (groupResolver.data?.id ?? null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { userGroups, createGroup, isCreatingGroup, isCreateGroupError, createGroupError } =
    useGroups({ isActive: true });

  const showSuccess = useCallback((msg: string) => {
    if (successTimer.current) clearTimeout(successTimer.current);
    setSuccessMessage(msg);
    successTimer.current = setTimeout(() => setSuccessMessage(''), 5000);
  }, []);

  const showError = useCallback((msg: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setErrorMessage(msg);
    errorTimer.current = setTimeout(() => setErrorMessage(''), 7000);
  }, []);

  const handleCreateNew = useCallback(() => {
    setCreateDialogOpen(true);
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  const handleCreateGroup = useCallback(
    (groupName: string, groupType: 'standard' | 'personal') => {
      if (isCreatingGroup) return;
      const name = groupName.trim();
      setSuccessMessage('');
      setErrorMessage('');
      createGroup(name, {
        groupType,
        onSuccess: (newGroup: GroupSummary) => {
          setCreateDialogOpen(false);
          showSuccess(`Space "${name}" erfolgreich erstellt!`);
          void navigate(buildGroupPath(newGroup));
        },
        onError: (error: Error | null) => {
          showError(error?.message || 'Space konnte nicht erstellt werden.');
        },
      });
    },
    [isCreatingGroup, createGroup, navigate, showSuccess, showError]
  );

  return (
    <PageContainer
      {...(!idOrSlug && {
        title: 'Spaces',
        subtitle: 'Verwalte deine Spaces, Mitglieder und geteilte Inhalte.',
      })}
      maxWidth="sm"
    >
      {(successMessage || errorMessage) && (
        <div className="mb-md">
          {successMessage && <StatusBanner variant="success">{successMessage}</StatusBanner>}
          {errorMessage && <StatusBanner variant="error">{errorMessage}</StatusBanner>}
        </div>
      )}

      {idOrSlug ? (
        resolvedGroupId ? (
          <GroupDetailSection
            key={resolvedGroupId}
            groupId={resolvedGroupId}
            onSuccessMessage={showSuccess}
            onErrorMessage={showError}
          />
        ) : groupResolver.isLoading ? (
          <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
            Space wird geladen…
          </p>
        ) : (
          <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
            Space „{idOrSlug}" nicht gefunden.
          </p>
        )
      ) : (
        <>
          <SectionHeader
            title="Deine Spaces"
            onCreate={handleCreateNew}
            createLabel={isCreatingGroup ? 'Wird erstellt...' : 'Neue Space erstellen'}
          />
          {userGroups && userGroups.length === 0 ? (
            <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
              Noch keine Spaces vorhanden. Erstelle deine erste Space über das Plus-Symbol.
            </p>
          ) : (
            <ToolGrid
              tools={(userGroups || []).map(
                (g): ToolEntry => ({
                  id: g.id,
                  title: g.name,
                  description: 'Space',
                  path: buildGroupPath(g),
                  icon: HiUserGroup,
                })
              )}
              columns={2}
            />
          )}
          <PublicGroupsSection onSuccessMessage={showSuccess} onErrorMessage={showError} />
        </>
      )}

      <GroupsCreateSection
        isOpen={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateGroup={handleCreateGroup}
        isCreatingGroup={isCreatingGroup}
        isCreateGroupError={isCreateGroupError}
        createGroupError={createGroupError}
      />
    </PageContainer>
  );
};

export default withAuthRequired(GruppenPage, { title: 'Spaces' });
