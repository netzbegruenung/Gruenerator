import { buildNotebookSlug } from '@gruenerator/shared/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SectionHeader,
  Skeleton,
} from '@gruenerator/ui';
import { memo, useCallback, useMemo, useState } from 'react';
import { HiDotsVertical, HiOutlineTrash, HiPencil, HiShare, HiUserGroup } from 'react-icons/hi';
import { PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import apiClient from '../../../components/utils/apiClient';
import { NotebookIcon } from '../../../config/icons';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups, type GroupSummary } from '../../groups/hooks/useGroups';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';

import { NotebookPageContent } from './NotebookPage';
import { VonDerBasisSection } from './VonDerBasisSection';

import type { NotebookCollection } from '../../../types/notebook';

const EMPTY_COLLECTIONS: NotebookCollection[] = [];

const HIDDEN_NOTEBOOK_IDS = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
];

const NotebookCard = memo(
  ({ notebook, groups }: { notebook: NotebookConfigEntry; groups: GroupSummary[] }) => {
    const navigate = useNavigate();
    const isFavourite = useSidebarFavouritesStore((s) => s.isFavourite);
    const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);
    const isFull = useSidebarFavouritesStore((s) => s.isFull);
    const starred = isFavourite(notebook.id);
    const canStar = starred || !isFull();
    const [sharedGroupId, setSharedGroupId] = useState<string | null>(null);

    const handleShareToGroup = async (groupId: string) => {
      try {
        await apiClient.post(`/auth/groups/${groupId}/share`, {
          contentType: 'system_notebooks',
          contentId: notebook.id,
          permissions: { read: true, write: false, collaborative: false },
        });
        setSharedGroupId(groupId);
        setTimeout(() => setSharedGroupId(null), 2000);
      } catch {
        // best-effort
      }
    };

    return (
      <div
        role="button"
        tabIndex={0}
        className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem] cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
        onClick={() => navigate(notebook.path, { state: { freshConversation: true } })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void navigate(notebook.path, { state: { freshConversation: true } });
          }
        }}
      >
        <notebook.icon className="text-base text-secondary-600 shrink-0" />
        <span className="text-sm font-medium text-foreground-heading flex-1">{notebook.title}</span>
        <div
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                aria-label="Aktionen"
              >
                <HiDotsVertical size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canStar && (
                <DropdownMenuItem onClick={() => toggleFavourite(notebook.id)}>
                  {starred ? <PiStarFill /> : <PiStar />}
                  {starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                </DropdownMenuItem>
              )}
              {groups.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <HiShare />
                    Teilen
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {groups.map((group) => (
                      <DropdownMenuItem key={group.id} onClick={() => handleShareToGroup(group.id)}>
                        <HiUserGroup />
                        {sharedGroupId === group.id ? 'Geteilt!' : group.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }
);
NotebookCard.displayName = 'NotebookCard';

const NotebookSection = memo(
  ({
    title,
    notebooks,
    columns = 1,
    groups = [],
  }: {
    title: string;
    notebooks: NotebookConfigEntry[];
    columns?: 1 | 2;
    groups?: GroupSummary[];
  }) => {
    const filtered = notebooks.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id));
    if (filtered.length === 0) return null;

    return (
      <section className="mt-xl">
        <SectionHeader title={title} />
        <div
          className={
            columns === 2
              ? 'grid grid-cols-4 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-sm'
              : 'flex flex-col gap-sm'
          }
        >
          {filtered.map((notebook) => (
            <NotebookCard key={notebook.id} notebook={notebook} groups={groups} />
          ))}
        </div>
      </section>
    );
  }
);
NotebookSection.displayName = 'NotebookSection';

const COLLAPSE_THRESHOLD = 3;

interface EigeneNotebooksProps {
  qaCollections: { id: string; name: string }[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onShare: (id: string) => void;
  onCreate: () => void;
  loading: boolean;
  copiedId?: string | null;
}

const EigeneNotebooks = memo(
  ({
    qaCollections,
    onView,
    onEdit,
    onDelete,
    onShare,
    onCreate,
    loading,
    copiedId,
  }: EigeneNotebooksProps) => {
    const [expanded, setExpanded] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [sharedInfo, setSharedInfo] = useState<string | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);

    const { userGroups = [] } = useGroups({ isActive: qaCollections.length > 0 });

    const handleDelete = async (id: string, name: string) => {
      if (window.confirm(`Notebook "${name}" wirklich löschen?`)) {
        setDeletingId(id);
        try {
          await onDelete(id);
        } finally {
          setDeletingId(null);
        }
      }
    };

    const handleShareToGroup = async (collectionId: string, groupId: string) => {
      try {
        await apiClient.post(`/auth/groups/${groupId}/share`, {
          contentType: 'notebook_collections',
          contentId: collectionId,
          permissions: { read: true, write: false, collaborative: false },
        });
        setSharedInfo(collectionId);
        setTimeout(() => setSharedInfo(null), 2000);
      } catch {
        setShareError(collectionId);
        setTimeout(() => setShareError(null), 2000);
      }
    };

    const visible =
      !expanded && qaCollections.length > COLLAPSE_THRESHOLD
        ? qaCollections.slice(0, COLLAPSE_THRESHOLD)
        : qaCollections;
    const shouldCollapse = qaCollections.length > COLLAPSE_THRESHOLD;

    return (
      <div className="mt-xl">
        <SectionHeader title="Eigene" onCreate={onCreate} createLabel="Notebook erstellen" />
        {loading ? (
          <div className="flex flex-col gap-sm">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-sm border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem] max-w-[14rem]"
              >
                <Skeleton className="size-5 rounded shrink-0" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : qaCollections.length === 0 ? (
          <p className="text-sm text-grey-500 dark:text-grey-400 mb-sm">
            Noch keine eigenen Notebooks.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-sm">
              {visible.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem] max-w-[14rem] cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => onView(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onView(c.id);
                    }
                  }}
                >
                  <NotebookIcon className="text-base text-secondary-600 shrink-0" />
                  <span className="text-sm font-medium text-foreground-heading truncate flex-1">
                    {c.name}
                  </span>
                  <div
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-center w-6 h-6 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                          aria-label="Aktionen"
                        >
                          <HiDotsVertical size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(c.id)}>
                          <HiPencil />
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <HiShare />
                            {sharedInfo === c.id
                              ? 'Geteilt!'
                              : shareError === c.id
                                ? 'Fehler!'
                                : 'Teilen'}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => onShare(c.id)}>
                              <HiShare />
                              {copiedId === c.id ? 'Link kopiert!' : 'Link kopieren'}
                            </DropdownMenuItem>
                            {userGroups.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                {(userGroups as { id: string; name: string }[]).map((group) => (
                                  <DropdownMenuItem
                                    key={group.id}
                                    onClick={() => handleShareToGroup(c.id, group.id)}
                                  >
                                    <HiUserGroup />
                                    {group.name}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(c.id, c.name)}
                        >
                          <HiOutlineTrash />
                          {deletingId === c.id ? 'Wird gelöscht…' : 'Löschen'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer transition-colors"
              >
                {expanded
                  ? 'Weniger anzeigen'
                  : `+${qaCollections.length - COLLAPSE_THRESHOLD} weitere anzeigen`}
              </button>
            )}
          </>
        )}
      </div>
    );
  }
);
EigeneNotebooks.displayName = 'EigeneNotebooks';

const EMPTY_GROUPS: GroupSummary[] = [];

function NotebooksIndexFooter() {
  const navigate = useNavigate();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';
  const { userGroups } = useGroups({ isActive: true });
  const stableGroups = userGroups ?? EMPTY_GROUPS;

  const allNotebooks = useMemo(
    () =>
      isAustrian
        ? getAustrianNotebooks()
        : [
            ...getNotebooksByCategory('bundesebene'),
            ...getNotebooksByCategory('landesebene'),
            ...getNotebooksByCategory('weitere'),
          ],
    [isAustrian]
  );

  const { query: collectionsQuery, deleteQACollection } = useNotebookCollections({
    isActive: true,
  });
  const qaCollections = collectionsQuery.data ?? EMPTY_COLLECTIONS;
  const collectionsLoading = collectionsQuery.isLoading;

  const handleCreate = useCallback(() => {
    void navigate('/notebooks/neu');
  }, [navigate]);

  // Resolve a collectionId to the Notion-style URL fragment when the row has
  // a slug_suffix, falling back to the raw UUID for legacy pre-backfill rows.
  // The bearbeiten/view routes both accept either form via NotebookResolver,
  // so a fallback simply gives a less-pretty URL — never a 404.
  const buildSlugFragment = useCallback(
    (collectionId: string): string => {
      const c = qaCollections.find((x) => x.id === collectionId);
      if (c?.slug_suffix) return buildNotebookSlug(c.name, c.slug_suffix);
      return collectionId;
    },
    [qaCollections]
  );

  const handleEdit = useCallback(
    (collectionId: string) => {
      void navigate(`/notebooks/${buildSlugFragment(collectionId)}/bearbeiten`);
    },
    [navigate, buildSlugFragment]
  );

  const handleView = useCallback(
    (collectionId: string) => {
      void navigate(`/notebooks/${buildSlugFragment(collectionId)}`, {
        state: { freshConversation: true },
      });
    },
    [navigate, buildSlugFragment]
  );

  const handleDelete = useCallback(
    async (collectionId: string) => {
      await deleteQACollection(collectionId);
    },
    [deleteQACollection]
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleShare = useCallback(
    (collectionId: string) => {
      // Canonical URL: plural `/notebooks/...` with the Notion-style slug. The
      // legacy singular `/notebook/:id` route still redirects, but copying the
      // canonical form means the redirect never fires for share recipients.
      const url = `${window.location.origin}/notebooks/${buildSlugFragment(collectionId)}`;
      void navigator.clipboard.writeText(url);
      setCopiedId(collectionId);
      setTimeout(() => setCopiedId(null), 2000);
    },
    [buildSlugFragment]
  );

  return (
    <section className="mt-xl">
      <div className="flex flex-wrap gap-xl max-md:flex-col">
        <div className="flex-1 min-w-0">
          <NotebookSection
            title="Notebooks"
            notebooks={allNotebooks}
            columns={2}
            groups={stableGroups}
          />
        </div>
        <div>
          <EigeneNotebooks
            qaCollections={qaCollections}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onShare={handleShare}
            onCreate={handleCreate}
            loading={collectionsLoading}
            copiedId={copiedId}
          />
        </div>
      </div>

      <VonDerBasisSection />
    </section>
  );
}

function NotebooksIndexPage() {
  const config = useMemo(() => getNotebookConfig('gruenerator'), []);
  return (
    <NotebookPageContent
      config={config}
      startpageFooter={<NotebooksIndexFooter />}
      showLastAdded={false}
      showStats={false}
      showExamples={false}
      hideGlobalChat
    />
  );
}

export default withAuthRequired(NotebooksIndexPage, {
  title: 'Notebooks',
});
