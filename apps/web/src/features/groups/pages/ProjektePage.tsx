import { buildGroupPath } from '@gruenerator/shared/groups';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { SectionHeader, StatusBanner } from '@gruenerator/ui';
import { useState, useCallback, useRef } from 'react';
import { HiUser, HiUserGroup } from 'react-icons/hi';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { useFirstName } from '../../../hooks/useFirstName';
import { OFFICE_PILL_ROW, OfficeActionPill } from '../../workplace/components/ToolsSection';
import { WorkplaceHero } from '../../workplace/components/WorkplaceHero';
import GroupDetailSection from '../components/GroupDetailSection';
import GroupsCreateSection from '../components/GroupsCreateSection';
import { ProjekteComposer } from '../components/ProjekteComposer';
import { ProjektTile } from '../components/ProjektTile';
import PublicGroupsSection from '../components/PublicGroupsSection';
import { useGroupResolver } from '../hooks/useGroupResolver';
import { useGroups, useInviteToGroup, type GroupSummary } from '../hooks/useGroups';

type ProjektType = 'personal' | 'standard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ProjektePage = () => {
  const navigate = useNavigate();
  const firstName = useFirstName();
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
  const [createType, setCreateType] = useState<ProjektType>('personal');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { userGroups, createGroup, isCreatingGroup, isCreateGroupError, createGroupError } =
    useGroups({ isActive: true });
  const inviteToGroup = useInviteToGroup();

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

  const openCreate = useCallback((type: ProjektType) => {
    setCreateType(type);
    setCreateDialogOpen(true);
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  const handleCreateGroup = useCallback(
    (groupName: string, groupType: ProjektType, inviteEmails: string[] = []) => {
      if (isCreatingGroup) return;
      const name = groupName.trim();
      const noun = groupType === 'standard' ? 'Gruppe' : 'Projekt';
      setSuccessMessage('');
      setErrorMessage('');
      createGroup(name, {
        groupType,
        onSuccess: (newGroup: GroupSummary) => {
          setCreateDialogOpen(false);
          // Navigate to the new group immediately; the target is the same
          // ProjektePage (detail view), so the banner still updates once the
          // invites resolve in the background.
          showSuccess(`${noun} „${name}" erfolgreich erstellt!`);
          void navigate(buildGroupPath(newGroup));
          if (inviteEmails.length > 0) {
            inviteToGroup.mutate(
              { groupId: newGroup.id, emails: inviteEmails },
              {
                onSuccess: (res) =>
                  showSuccess(
                    `${res.sent} Einladung${res.sent === 1 ? '' : 'en'} versendet.` +
                      (res.failed.length ? ` ${res.failed.length} fehlgeschlagen.` : '')
                  ),
                onError: () => showError('Einladungen konnten nicht versendet werden.'),
              }
            );
          }
        },
        onError: (error: Error | null) => {
          showError(error?.message || `${noun} konnte nicht erstellt werden.`);
        },
      });
    },
    [isCreatingGroup, createGroup, inviteToGroup, navigate, showSuccess, showError]
  );

  const banners = (successMessage || errorMessage) && (
    <div className="mb-md">
      {successMessage && <StatusBanner variant="success">{successMessage}</StatusBanner>}
      {errorMessage && <StatusBanner variant="error">{errorMessage}</StatusBanner>}
    </div>
  );

  const createDialog = (
    <GroupsCreateSection
      isOpen={createDialogOpen}
      onOpenChange={setCreateDialogOpen}
      onCreateGroup={handleCreateGroup}
      isCreatingGroup={isCreatingGroup}
      isCreateGroupError={isCreateGroupError}
      createGroupError={createGroupError}
      initialProjektType={createType}
    />
  );

  // Detail view — unchanged compact shell.
  if (idOrSlug) {
    return (
      <PageContainer maxWidth="sm">
        {banners}
        {resolvedGroupId ? (
          <GroupDetailSection
            key={resolvedGroupId}
            groupId={resolvedGroupId}
            onSuccessMessage={showSuccess}
            onErrorMessage={showError}
          />
        ) : groupResolver.isLoading ? (
          <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
            Projekt wird geladen…
          </p>
        ) : (
          <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
            Projekt „{idOrSlug}" nicht gefunden.
          </p>
        )}
        {createDialog}
      </PageContainer>
    );
  }

  // Overview — Office/Studio landing recipe: tinted gradient shell, hero greeting,
  // a create-or-search composer, the two create "tools", then the project grids.
  return (
    <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient('projekte')}>
      {banners}

      <WorkplaceHero title={firstName ? `Deine Projekte, ${firstName}` : 'Deine Projekte'}>
        <ProjekteComposer
          projekte={userGroups}
          isCreating={isCreatingGroup}
          onCreate={handleCreateGroup}
        />
      </WorkplaceHero>

      <section className="mb-xl mt-md">
        <div className={OFFICE_PILL_ROW}>
          <OfficeActionPill
            styleKey="projekte"
            icon={HiUser}
            title="Projekt erstellen"
            onClick={() => openCreate('personal')}
          />
          <OfficeActionPill
            styleKey="projekte"
            icon={HiUserGroup}
            title="Gruppe erstellen"
            onClick={() => openCreate('standard')}
          />
        </div>
      </section>

      <SectionHeader title="Deine Projekte" />
      {userGroups && userGroups.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Noch keine Projekte vorhanden. Erstelle dein erstes Projekt über das Feld oben.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,200px))] gap-3 sm:gap-4">
          {(userGroups || []).map((g) => (
            <ProjektTile key={g.id} projekt={g} />
          ))}
        </div>
      )}
      <PublicGroupsSection onSuccessMessage={showSuccess} onErrorMessage={showError} />

      {createDialog}
    </PageContainer>
  );
};

export default withAuthRequired(ProjektePage, { title: 'Projekte' });
