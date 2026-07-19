import { getContractsClient } from '@gruenerator/shared/api';
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
import { NotebookIcon } from '../../../config/icons';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups, type GroupSummary } from '../../groups/hooks/useGroups';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';

import NotebookCreateCard from './NotebookCreateCard';
import NotebookGalleryCard from './NotebookGalleryCard';
import { NotebookPageContent } from './NotebookPage';
import { VonDerBasisSection } from './VonDerBasisSection';

import type { NotebookCollection } from '../../../types/notebook';

// Responsive grid of the notebook cards — used by the "Eigene" section. Capped
// at 5 per row.
const NOTEBOOK_GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-md';

// System notebooks live in a single horizontal strip. Fractional tile widths keep
// the next card half-visible at the edge so the scroll affordance is obvious; the
// pt/pb leave room for the hover lift + shadow inside the clipping container.
const NOTEBOOK_SCROLL_ROW = 'flex gap-3 overflow-x-auto pt-1 pb-3 sm:gap-4';
// Tile width = (row − its gaps) ÷ an .5 count, so the next card stays ~half visible
// (a deliberate scroll tease) at any width. Mirrors the Arbeiten tool strip.
const NOTEBOOK_SCROLL_ITEM =
  'shrink-0 basis-[calc((100%_-_1.5rem)_*_0.4)] sm:basis-[calc((100%_-_3rem)_*_0.2857)] md:basis-[calc((100%_-_4rem)_*_0.2222)] lg:basis-[calc((100%_-_5rem)_*_0.1818)]';

const EMPTY_COLLECTIONS: NotebookCollection[] = [];

const HIDDEN_NOTEBOOK_IDS = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
  // Vorerst ausgeblendet — Kachel wieder einblenden = diese Zeile entfernen.
  'abgeordnetenwatch-notebook',
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
        const res = await getContractsClient().groups.shareContent({
          params: { groupId },
          body: {
            contentType: 'system_notebooks',
            contentId: notebook.id,
            permissions: { read: true, write: false, collaborative: false },
          },
        });
        if (res.status !== 200) throw new Error('share failed');
        setSharedGroupId(groupId);
        setTimeout(() => setSharedGroupId(null), 2000);
      } catch {
        // best-effort
      }
    };

    const hasMenu = canStar || groups.length > 0;

    return (
      <NotebookGalleryCard
        title={notebook.title}
        meta={notebook.meta}
        icon={notebook.icon}
        coverImage={notebook.coverImage}
        accent="pink"
        onActivate={() => navigate(notebook.path, { state: { freshConversation: true } })}
        menu={
          hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center size-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
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
                        <DropdownMenuItem
                          key={group.id}
                          onClick={() => handleShareToGroup(group.id)}
                        >
                          <HiUserGroup />
                          {sharedGroupId === group.id ? 'Geteilt!' : group.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
    );
  }
);
NotebookCard.displayName = 'NotebookCard';

const NotebookSection = memo(
  ({
    title,
    notebooks,
    groups = [],
  }: {
    title: string;
    notebooks: NotebookConfigEntry[];
    groups?: GroupSummary[];
  }) => {
    const filtered = notebooks.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id));
    if (filtered.length === 0) return null;

    return (
      <section className="mt-xl">
        <SectionHeader title={title} />
        <div className={NOTEBOOK_SCROLL_ROW}>
          {filtered.map((notebook) => (
            <div key={notebook.id} className={NOTEBOOK_SCROLL_ITEM}>
              <NotebookCard notebook={notebook} groups={groups} />
            </div>
          ))}
        </div>
      </section>
    );
  }
);
NotebookSection.displayName = 'NotebookSection';

const COLLAPSE_THRESHOLD = 3;

const isOwnedCollection = (c: NotebookCollection): boolean =>
  c.access_source == null || c.access_source === 'owned';

interface EigeneNotebooksProps {
  qaCollections: NotebookCollection[];
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
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const { userGroups = [] } = useGroups({ isActive: qaCollections.length > 0 });

    const handleDelete = async (id: string, name: string) => {
      if (window.confirm(`Notebook "${name}" wirklich löschen?`)) {
        setDeletingId(id);
        setDeleteError(null);
        try {
          await onDelete(id);
        } catch {
          setDeleteError(id);
          setTimeout(() => setDeleteError(null), 2000);
        } finally {
          setDeletingId(null);
        }
      }
    };

    const handleShareToGroup = async (collectionId: string, groupId: string) => {
      try {
        const res = await getContractsClient().groups.shareContent({
          params: { groupId },
          body: {
            contentType: 'notebook_collections',
            contentId: collectionId,
            permissions: { read: true, write: false, collaborative: false },
          },
        });
        if (res.status !== 200) throw new Error('share failed');
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
          <div className={NOTEBOOK_GRID_CLASS}>
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-grey-200/80 dark:border-grey-700/60"
              >
                <Skeleton className="aspect-[5/4] rounded-none" />
                <div className="px-3 py-2.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-1.5 h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : qaCollections.length === 0 ? (
          <div className={NOTEBOOK_GRID_CLASS}>
            <NotebookCreateCard onClick={onCreate} />
          </div>
        ) : (
          <>
            <div className={NOTEBOOK_GRID_CLASS}>
              {visible.map((c) => (
                <NotebookGalleryCard
                  key={c.id}
                  title={c.name}
                  meta={c.description || 'Eigenes Notebook'}
                  icon={NotebookIcon}
                  accent="pink"
                  onActivate={() => onView(c.id)}
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-center size-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
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
                            {isOwnedCollection(c) && userGroups.length > 0 && (
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
                        {isOwnedCollection(c) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(c.id, c.name)}
                            >
                              <HiOutlineTrash />
                              {deleteError === c.id
                                ? 'Fehler!'
                                : deletingId === c.id
                                  ? 'Wird gelöscht…'
                                  : 'Löschen'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              ))}
              <NotebookCreateCard onClick={onCreate} />
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
  // "Eigene" must only ever show notebooks the user owns. The backend already
  // returns owned-only, but filter defensively so a non-owned notebook can
  // never render here even if another path repopulates the query cache.
  const qaCollections = useMemo(
    () => (collectionsQuery.data ?? EMPTY_COLLECTIONS).filter(isOwnedCollection),
    [collectionsQuery.data]
  );
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
      const url = `${getPublicAppOrigin()}/notebooks/${buildSlugFragment(collectionId)}`;
      void navigator.clipboard.writeText(url);
      setCopiedId(collectionId);
      setTimeout(() => setCopiedId(null), 2000);
    },
    [buildSlugFragment]
  );

  return (
    <section className="mt-xl" data-tour="wissen-notebooks">
      <NotebookSection title="Notebooks" notebooks={allNotebooks} groups={stableGroups} />

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
      omniComposer
      pageGradient={false}
    />
  );
}

/** Unwrapped variant for embedding (workplace "Wissen" tab — auth-gated route). */
export { NotebooksIndexPage as NotebooksIndexContent };

export default withAuthRequired(NotebooksIndexPage, {
  title: 'Notebooks',
});
