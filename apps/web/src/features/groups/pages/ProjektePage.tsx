import {
  buildGroupPath,
  groupContentKey,
  sortGroups,
  splitArchivedGroups,
  type GroupSort,
} from '@gruenerator/shared/groups';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import {
  Button,
  ConfirmDialogProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SectionHeader,
  StatusBanner,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo, useRef } from 'react';
import { PiPlus, PiSortAscending } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { useFirstName } from '../../../hooks/useFirstName';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { WorkplaceHero } from '../../workplace/components/WorkplaceHero';
import GroupDetailSection from '../components/GroupDetailSection';
import GroupsCreateSection, { type CreateGroupExtras } from '../components/GroupsCreateSection';
import { ProjekteComposer } from '../components/ProjekteComposer';
import { ProjekteRecipesSection } from '../components/ProjekteRecipesSection';
import { ProjektTile } from '../components/ProjektTile';
import PublicGroupsSection from '../components/PublicGroupsSection';
import { useGroupResolver } from '../hooks/useGroupResolver';
import { useGroups, useInviteToGroup, type GroupSummary } from '../hooks/useGroups';
import { serverMessage } from '../serverMessage';

const SORT_LABELS: Record<GroupSort, string> = {
  activity: 'Zuletzt aktiv',
  name: 'Name',
  newest: 'Neueste',
};

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
  const [createName, setCreateName] = useState('');
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    userGroups,
    isLoadingGroups,
    isErrorGroups,
    refetchGroups,
    createGroup,
    isCreatingGroup,
    isCreateGroupError,
    createGroupError,
  } = useGroups({ isActive: true });
  const inviteToGroup = useInviteToGroup();
  const [sort, setSort] = useState<GroupSort>('activity');
  const { active: activeGroups, archived: archivedGroups } = useMemo(() => {
    const split = splitArchivedGroups(userGroups ?? []);
    return { active: sortGroups(split.active, sort), archived: split.archived };
  }, [userGroups, sort]);

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

  const openCreate = useCallback((name = '') => {
    setCreateName(name);
    setCreateDialogOpen(true);
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  // Nach dem Anlegen, im Hintergrund: dieselbe Tür wie „Datei hinzufügen" im
  // Projekt (Hochladen und im selben Zug ins Projekt teilen).
  const uploadFiles = useCallback(
    async (groupId: string, files: File[]) => {
      const upload = useDocumentsStore.getState().uploadFileOnly;
      let added = 0;
      let lastError: string | null = null;
      for (const file of files) {
        try {
          await upload(file, undefined, undefined, groupId);
          added += 1;
        } catch (err) {
          lastError = serverMessage(err, 'Datei konnte nicht hinzugefügt werden.');
        }
      }
      if (added > 0) {
        void queryClient.invalidateQueries({ queryKey: groupContentKey(groupId) });
        showSuccess(`${added} ${added === 1 ? 'Datei' : 'Dateien'} zum Projekt hinzugefügt.`);
      }
      if (lastError) showError(lastError);
    },
    [queryClient, showSuccess, showError]
  );

  const handleCreateGroup = useCallback(
    (
      groupName: string,
      inviteEmails: string[] = [],
      extras: CreateGroupExtras = { description: '', files: [] }
    ) => {
      if (isCreatingGroup) return;
      const name = groupName.trim();
      setSuccessMessage('');
      setErrorMessage('');
      createGroup(name, {
        description: extras.description,
        onSuccess: (newGroup: GroupSummary) => {
          setCreateDialogOpen(false);
          // Navigate to the new group immediately; the target is the same
          // ProjektePage (detail view), so the banner still updates once the
          // invites resolve in the background.
          showSuccess(`Projekt „${name}" erfolgreich erstellt!`);
          void navigate(buildGroupPath(newGroup));
          if (extras.files.length > 0) void uploadFiles(newGroup.id, extras.files);
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
          showError(error?.message || 'Projekt konnte nicht erstellt werden.');
        },
      });
    },
    [isCreatingGroup, createGroup, inviteToGroup, navigate, showSuccess, showError, uploadFiles]
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
      initialName={createName}
    />
  );

  // Detail view — feed plus sidebar needs the wide shell.
  if (idOrSlug) {
    return (
      <PageContainer maxWidth="lg">
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
  // a create-or-search composer, the create "tool", then the project grids.
  return (
    <PageContainer maxWidth="lg" noPadTop bgClassName={getToolGradient('projekte')}>
      {banners}

      <WorkplaceHero title={firstName ? `Deine Projekte, ${firstName}` : 'Deine Projekte'}>
        <ProjekteComposer
          projekte={activeGroups}
          isCreating={isCreatingGroup}
          onCreate={openCreate}
        />
      </WorkplaceHero>

      <SectionHeader
        title="Deine Projekte"
        actions={
          <div className="flex items-center gap-xs">
            {activeGroups.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Projekte sortieren: ${SORT_LABELS[sort]}`}
                    title={`Sortieren: ${SORT_LABELS[sort]}`}
                  >
                    <PiSortAscending aria-hidden className="size-[18px]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(v) => setSort(v as GroupSort)}
                  >
                    {(Object.keys(SORT_LABELS) as GroupSort[]).map((key) => (
                      <DropdownMenuRadioItem key={key} value={key}>
                        {SORT_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Neues Projekt"
              title="Neues Projekt"
              onClick={() => openCreate()}
            >
              <PiPlus aria-hidden className="size-[18px]" />
            </Button>
          </div>
        }
      />
      {/* „Noch keine Projekte" ist die härteste Aussage dieser Fläche und darf
          nur aus einer bestätigt leeren Liste kommen. `userGroups` ist
          `query.data ?? []`, also auch dann leer, wenn noch geladen wird oder
          der Abruf gescheitert ist — ein Fehler bliebe hier sonst als „du hast
          nichts" stehen, weil `refetchOnWindowFocus` aus ist und der Toast bei
          401 unterdrückt wird. Warum `isLoadingGroups` genau der richtige
          Ladezustand ist, steht am Hook. */}
      {isLoadingGroups ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Projekte werden geladen…
        </p>
      ) : isErrorGroups ? (
        <div className="py-lg text-center">
          <p className="mb-md text-foreground">Deine Projekte konnten nicht geladen werden.</p>
          <Button variant="outline" size="sm" onClick={() => void refetchGroups()}>
            Erneut versuchen
          </Button>
        </div>
      ) : activeGroups.length === 0 && archivedGroups.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
          Noch keine Projekte vorhanden. Erstelle dein erstes Projekt über das Feld oben.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
          {activeGroups.map((g) => (
            <ProjektTile key={g.id} projekt={g} />
          ))}
        </div>
      )}
      {archivedGroups.length > 0 && (
        <details className="mt-lg">
          <summary className="cursor-pointer text-sm font-medium text-grey-600 dark:text-grey-300">
            Archiviert ({archivedGroups.length})
          </summary>
          <div className="mt-md grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
            {archivedGroups.map((g) => (
              <ProjektTile key={g.id} projekt={g} />
            ))}
          </div>
        </details>
      )}
      <ProjekteRecipesSection />
      <PublicGroupsSection onSuccessMessage={showSuccess} onErrorMessage={showError} />

      {createDialog}
    </PageContainer>
  );
};

/** Löschen eines Rezepts fragt per AlertDialog nach, nicht per `window.confirm`. */
function ProjekteRoute() {
  return (
    <ConfirmDialogProvider>
      <ProjektePage />
    </ConfirmDialogProvider>
  );
}

export default withAuthRequired(ProjekteRoute, { title: 'Projekte' });
