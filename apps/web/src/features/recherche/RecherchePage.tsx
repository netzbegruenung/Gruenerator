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
} from '@gruenerator/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import NotebookEditor from '../notebook/components/NotebookEditor';
import NotebookList from '../notebook/components/NotebookList';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  SYSTEM_NOTEBOOKS,
  type NotebookConfigEntry,
} from '../notebook/config/notebooksConfig';
import useNotebookStore from '../notebook/stores/notebookStore';

import type { ToolEntry } from '../../components/common/ToolGrid';

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
    id: 'datenbank',
    title: 'Datenbank',
    description: 'Durchsuche Vorlagen, Prompts und Anträge für deine grüne Arbeit.',
    path: '/datenbank',
    icon: getIcon('navigation', 'datenbank'),
    tags: ['Vorlagen', 'Prompts', 'Anträge'],
  },
];

const HIDDEN_NOTEBOOK_IDS = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
];

const NotebookCard = ({
  notebook,
  groups,
}: {
  notebook: NotebookConfigEntry;
  groups: GroupSummary[];
}) => {
  const navigate = useNavigate();
  const { isFavourite, toggleFavourite, isFull } = useSidebarFavouritesStore();
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
};

const COLLAPSE_THRESHOLD = 3;

const NotebookSection = ({
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
};

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

const EigeneNotebooks = ({
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
        <div className="flex items-center gap-sm py-md">
          <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
          <span className="text-sm text-foreground">Laden...</span>
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
};

const RecherchePage = () => {
  const navigate = useNavigate();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';
  const { userGroups = [] } = useGroups({ isActive: true });

  const bundesebeneNotebooks = getNotebooksByCategory('bundesebene');
  const landesebeneNotebooks = getNotebooksByCategory('landesebene');
  const weitereNotebooks = getNotebooksByCategory('weitere');
  const austrianNotebooks = getAustrianNotebooks();

  const {
    qaCollections,
    loading: collectionsLoading,
    fetchQACollections,
    createQACollection,
    updateQACollection,
    deleteQACollection,
    getQACollection,
  } = useNotebookStore();

  const { pollDocumentStatus } = useDocumentsStore();

  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = useMemo(
    () =>
      searchQuery
        ? tools.filter(
            (t) =>
              t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              t.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : tools,
    [searchQuery]
  );

  const filteredQaCollections = useMemo(
    () =>
      searchQuery
        ? qaCollections.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : qaCollections,
    [searchQuery, qaCollections]
  );

  const searchResultNotebooks = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return SYSTEM_NOTEBOOKS.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id)).filter(
      (nb) => nb.title.toLowerCase().includes(q) || nb.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const [showEditor, setShowEditor] = useState(false);
  const [editingCollection, setEditingCollection] = useState<ReturnType<
    typeof getQACollection
  > | null>(null);
  const [processingCollectionIds, setProcessingCollectionIds] = useState<Set<string>>(new Set());
  const pollingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchQACollections();
  }, [fetchQACollections]);

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
          fetchQACollections();
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
    [pollDocumentStatus, fetchQACollections]
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
          startPolling(result.id, saveData.documents);
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

        {searchQuery ? (
          <>
            {searchResultNotebooks.length > 0 && (
              <>
                <h2 className="text-xl font-semibold text-foreground-heading mb-md">Notebooks</h2>
                <div className="grid grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2 gap-sm">
                  {searchResultNotebooks.map((notebook) => (
                    <NotebookCard key={notebook.id} notebook={notebook} groups={userGroups} />
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

            {searchResultNotebooks.length === 0 &&
              filteredQaCollections.length === 0 &&
              filteredTools.length === 0 && (
                <p className="text-center text-foreground py-xl">
                  Keine Ergebnisse für &ldquo;{searchQuery}&rdquo;
                </p>
              )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-xl max-md:flex-col">
              <div className="flex-1 min-w-0">
                <NotebookSection
                  title="Notebooks"
                  notebooks={
                    isAustrian
                      ? austrianNotebooks
                      : [...bundesebeneNotebooks, ...landesebeneNotebooks, ...weitereNotebooks]
                  }
                  columns={2}
                  search={searchQuery}
                  groups={userGroups}
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
          </>
        )}

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
