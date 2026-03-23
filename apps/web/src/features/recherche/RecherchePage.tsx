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
import { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineTrash,
  HiPencil,
  HiPlus,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { PiMagnifyingGlass, PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ToolGrid from '../../components/common/ToolGrid';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Separator } from '../../components/ui/separator';
import apiClient from '../../components/utils/apiClient';
import { getIcon, NotebookIcon } from '../../config/icons';
import { useGroups, type GroupSummary } from '../../features/groups/hooks/useGroups';
import { useAuthStore } from '../../stores/authStore';
import { useDocumentsStore } from '../../stores/documentsStore';
import useSidebarFavouritesStore from '../../stores/sidebarFavouritesStore';
import { useNotebookCollections } from '../auth/hooks/useProfileData';
import NotebookEditor from '../notebook/components/NotebookEditor';
import NotebookList from '../notebook/components/NotebookList';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  SYSTEM_NOTEBOOKS,
  type NotebookConfigEntry,
} from '../notebook/config/notebooksConfig';

import type { ToolEntry } from '../../components/common/ToolGrid';
import type { NotebookCollection } from '../../types/notebook';

import { cn } from '@/utils/cn';

interface EditorSaveData {
  id?: string;
  name: string;
  description?: string;
  selectionMode?: 'documents' | 'wolke';
  documents?: string[];
  wolkeShareLinks?: string[];
  labels?: string[];
}

const tools: ToolEntry[] = [
  {
    id: 'suche',
    title: 'Suche',
    description: 'Webrecherche für aktuelle Informationen mit KI-Unterstützung.',
    path: '/suche',
    icon: getIcon('navigation', 'suche'),
    tags: ['Web', 'Recherche'],
  },
  {
    id: 'research',
    title: 'Manuell',
    description: 'Manuelle Suche über alle gescrapten Dokumente und Programme.',
    path: '/research',
    icon: getIcon('navigation', 'research'),
    tags: ['Dokumente', 'Qdrant'],
  },
  {
    id: 'monitor',
    title: 'Monitor',
    description: 'Medienbeobachtung mit Themen, Stimmung, Umfragen und Risiko-Analyse.',
    path: '/monitor',
    icon: getIcon('navigation', 'monitor'),
    tags: ['Medien', 'Trends'],
  },
];

const EMPTY_NOTEBOOKS: NotebookConfigEntry[] = [];
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
    const showStar = starred || !isFull();
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
            navigate(notebook.path, { state: { freshConversation: true } });
          }
        }}
      >
        <notebook.icon className="text-base text-secondary-600 shrink-0" />
        <span className="text-sm font-medium text-foreground-heading flex-1">{notebook.title}</span>
        {groups.length > 0 && (
          <div
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center w-6 h-6 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Teilen"
                >
                  <HiShare size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {groups.map((group) => (
                  <DropdownMenuItem key={group.id} onClick={() => handleShareToGroup(group.id)}>
                    <HiUserGroup />
                    {sharedGroupId === group.id ? 'Geteilt!' : group.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {showStar && (
          <button
            type="button"
            className={cn(
              'shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300',
              starred
                ? 'text-primary-600 hover:text-primary-700'
                : 'text-grey-400 opacity-0 group-hover:opacity-100 hover:text-primary-600'
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavourite(notebook.id);
            }}
            aria-label={starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          >
            {starred ? <PiStarFill size={14} /> : <PiStar size={14} />}
          </button>
        )}
      </div>
    );
  }
);
NotebookCard.displayName = 'NotebookCard';

const COLLAPSE_THRESHOLD = 3;

const NotebookSection = memo(
  ({
    title,
    notebooks,
    search,
    columns = 1,
    groups = [],
  }: {
    title: string;
    notebooks: NotebookConfigEntry[];
    search?: string;
    columns?: 1 | 2;
    groups?: { id: string; name: string }[];
  }) => {
    const filtered = notebooks
      .filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id))
      .filter((nb) => !search || nb.title.toLowerCase().includes(search.toLowerCase()));
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

const RecherchePage = () => {
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

  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredTools = useMemo(
    () =>
      deferredQuery
        ? tools.filter(
            (t) =>
              t.title.toLowerCase().includes(deferredQuery.toLowerCase()) ||
              t.description.toLowerCase().includes(deferredQuery.toLowerCase())
          )
        : tools,
    [deferredQuery]
  );

  const filteredQaCollections = useMemo(
    () =>
      deferredQuery
        ? qaCollections.filter((c) => c.name.toLowerCase().includes(deferredQuery.toLowerCase()))
        : qaCollections,
    [deferredQuery, qaCollections]
  );

  const searchResultNotebooks = useMemo(() => {
    if (!deferredQuery) return EMPTY_NOTEBOOKS;
    const q = deferredQuery.toLowerCase();
    return SYSTEM_NOTEBOOKS.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id)).filter(
      (nb) => nb.title.toLowerCase().includes(q) || nb.description.toLowerCase().includes(q)
    );
  }, [deferredQuery]);

  const [showEditor, setShowEditor] = useState(false);
  const [editingCollection, setEditingCollection] = useState<NotebookCollection | null>(null);
  const [processingCollectionIds, setProcessingCollectionIds] = useState<Set<string>>(new Set());
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
      navigate(`/notebook/${collectionId}`, { state: { freshConversation: true } });
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
    navigator.clipboard.writeText(url);
    setCopiedId(collectionId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const startPolling = useCallback(
    (collectionId: string, documentIds: string[]) => {
      if (pollingRef.current.has(collectionId)) return;
      pollingRef.current.add(collectionId);

      setProcessingCollectionIds((prev) => new Set([...prev, collectionId]));

      Promise.all(documentIds.map((docId) => pollDocumentStatus(docId)))
        .then(() => {
          pollingRef.current.delete(collectionId);
          setProcessingCollectionIds((prev) => {
            const next = new Set(prev);
            next.delete(collectionId);
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ['notebookCollections'] });
        })
        .catch(() => {
          pollingRef.current.delete(collectionId);
          setProcessingCollectionIds((prev) => {
            const next = new Set(prev);
            next.delete(collectionId);
            return next;
          });
        });
    },
    [pollDocumentStatus, queryClient]
  );

  const handleSave = useCallback(
    async (data: unknown) => {
      const saveData = data as EditorSaveData;
      if (saveData.id) {
        await updateQACollection(saveData.id, {
          name: saveData.name,
          description: saveData.description,
          selectionMode: saveData.selectionMode,
          documents: saveData.documents,
          wolkeShareLinks: saveData.wolkeShareLinks,
          labels: saveData.labels,
        });
      } else {
        const result = await createQACollection({
          name: saveData.name,
          description: saveData.description,
          selectionMode: saveData.selectionMode,
          documents: saveData.documents,
          wolkeShareLinks: saveData.wolkeShareLinks,
          labels: saveData.labels,
        });

        if (result?.id && saveData.documents?.length) {
          startPolling(String(result.id), saveData.documents);
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
    <ErrorBoundary>
      <PageContainer title="Recherche" subtitle="Suche, Wissensmanagement und Dokumentenrecherche.">
        <div className="relative max-w-[500px] mx-auto mb-lg">
          <PiMagnifyingGlass className="absolute left-md top-1/2 -translate-y-1/2 text-grey-400 text-lg" />
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-2xl pr-md py-sm bg-background border border-grey-200 dark:border-grey-700 rounded-lg text-base text-foreground placeholder:text-grey-400 focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        {/* Search results — visible when searching */}
        <div className={deferredQuery ? undefined : 'hidden'}>
          {searchResultNotebooks.length > 0 && (
            <>
              <h2 className="text-xl font-semibold text-foreground-heading mb-md">Notebooks</h2>
              <div className="grid grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2 gap-sm">
                {searchResultNotebooks.map((notebook) => (
                  <NotebookCard key={notebook.id} notebook={notebook} groups={stableGroups} />
                ))}
              </div>
            </>
          )}

          {filteredQaCollections.length > 0 && (
            <>
              <h2 className="text-xl font-semibold text-foreground-heading mt-xl mb-md">
                Meine Notebooks
              </h2>
              <NotebookList
                qaCollections={filteredQaCollections}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onShare={handleShare}
                loading={collectionsLoading}
                processingCollectionIds={processingCollectionIds}
                compact
              />
            </>
          )}

          {filteredTools.length > 0 && (
            <>
              <h2 className="text-xl font-semibold text-foreground-heading mt-xl mb-md">Tools</h2>
              <ToolGrid tools={filteredTools} columns={3} />
            </>
          )}

          {deferredQuery &&
            searchResultNotebooks.length === 0 &&
            filteredQaCollections.length === 0 &&
            filteredTools.length === 0 && (
              <p className="text-center text-foreground py-xl">
                Keine Ergebnisse für &ldquo;{searchQuery}&rdquo;
              </p>
            )}
        </div>

        {/* Default view — visible when not searching */}
        <div className={deferredQuery ? 'hidden' : undefined}>
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
          <Separator className="mt-xl" />

          <h2 className="text-xl font-semibold text-foreground-heading mt-xl mb-md">Tools</h2>
          <ToolGrid tools={tools} columns={3} />
        </div>

        <Dialog open={showEditor} onOpenChange={(open) => !open && handleCancel()}>
          <DialogContent
            className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0 [&>[data-slot=dialog-close]]:hidden"
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
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(RecherchePage, {
  title: 'Recherche',
});
