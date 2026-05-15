import { type NotebookEditorSavePayload } from '@gruenerator/contracts';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Skeleton,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  HiCog,
  HiDotsVertical,
  HiOutlineTrash,
  HiPencil,
  HiPlus,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import apiClient from '../../../components/utils/apiClient';
import { NotebookIcon } from '../../../config/icons';
import { useAuthStore } from '../../../stores/authStore';
import { useDocumentsStore } from '../../../stores/documentsStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups, type GroupSummary } from '../../groups/hooks/useGroups';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';

import NotebookEditor from './NotebookEditor';
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
      <>
        <h2 className="text-xl font-semibold text-foreground-heading mt-xl mb-md">{title}</h2>
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
      </>
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
    const navigate = useNavigate();
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
      <div>
        <div className="flex items-center gap-xs mt-xl mb-md">
          <h2 className="text-xl font-semibold text-foreground-heading m-0">Eigene</h2>
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer"
            aria-label="Notebook erstellen"
          >
            <HiPlus size={18} />
          </button>
          <button
            type="button"
            onClick={() => void navigate('/notebooks/meine')}
            className="flex items-center justify-center w-7 h-7 rounded-full text-grey-500 hover:text-foreground hover:bg-grey-200/40 dark:hover:bg-grey-700/40 transition-colors cursor-pointer"
            aria-label="Meine Notebooks verwalten"
            title="Meine Notebooks verwalten"
          >
            <HiCog size={16} />
          </button>
        </div>
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

  const queryClient = useQueryClient();
  const {
    query: collectionsQuery,
    createQACollection,
    updateQACollection,
    deleteQACollection,
    getQACollection,
  } = useNotebookCollections({ isActive: true });
  const qaCollections = collectionsQuery.data ?? EMPTY_COLLECTIONS;
  const collectionsLoading = collectionsQuery.isLoading;

  const pollDocumentStatus = useDocumentsStore((s) => s.pollDocumentStatus);

  const [showEditor, setShowEditor] = useState(false);
  const [editingCollection, setEditingCollection] = useState<NotebookCollection | null>(null);
  const pollingRef = useRef<Set<string>>(new Set());

  const handleCreate = useCallback(() => {
    setEditingCollection(null);
    setShowEditor(true);
  }, []);

  const handleEdit = useCallback(
    (collectionId: string) => {
      const collection = getQACollection(collectionId);
      if (collection) {
        setEditingCollection(collection);
        setShowEditor(true);
      }
    },
    [getQACollection]
  );

  const handleView = useCallback(
    (collectionId: string) => {
      void navigate(`/notebook/${collectionId}`, { state: { freshConversation: true } });
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (collectionId: string) => {
      await deleteQACollection(collectionId);
    },
    [deleteQACollection]
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleShare = useCallback((collectionId: string) => {
    const url = `${window.location.origin}/notebook/${collectionId}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(collectionId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const startPolling = useCallback(
    (collectionId: string, documentIds: string[]) => {
      if (pollingRef.current.has(collectionId)) return;
      pollingRef.current.add(collectionId);

      Promise.all(documentIds.map((docId) => pollDocumentStatus(docId)))
        .then(() => {
          pollingRef.current.delete(collectionId);
          void queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
        })
        .catch(() => {
          pollingRef.current.delete(collectionId);
        });
    },
    [pollDocumentStatus, queryClient]
  );

  const handleSave = useCallback(
    async (data: NotebookEditorSavePayload) => {
      if (data.id) {
        await updateQACollection(data.id, {
          name: data.name,
          description: data.description,
          selectionMode: data.selectionMode,
          documents: data.documents,
          labels: data.labels,
          wolkeFolders: data.wolkeFolders,
        });
      } else {
        const result = await createQACollection({
          name: data.name,
          description: data.description,
          selectionMode: data.selectionMode,
          documents: data.documents,
          labels: data.labels,
          wolkeFolders: data.wolkeFolders,
        });

        if (result?.id && data.documents.length) {
          startPolling(String(result.id), data.documents);
        }
      }
      setShowEditor(false);
      setEditingCollection(null);
    },
    [createQACollection, updateQACollection, startPolling]
  );

  const handleCancel = useCallback(() => {
    setShowEditor(false);
    setEditingCollection(null);
  }, []);

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

      {/* Tools section commented out per request — chat composer at the top covers Suche. */}

      <Dialog open={showEditor} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent
          className="sm:max-w-[700px] w-[calc(100%-1rem)] max-h-[90dvh] overflow-y-auto p-0 [&>[data-slot=dialog-close]]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {editingCollection ? 'Notebook bearbeiten' : 'Notebook erstellen'}
          </DialogTitle>
          <NotebookEditor
            onSave={handleSave}
            onCancel={handleCancel}
            editingCollection={editingCollection}
            loading={collectionsLoading}
          />
        </DialogContent>
      </Dialog>
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
    />
  );
}

export default withAuthRequired(NotebooksIndexPage, {
  title: 'Notebooks',
});
