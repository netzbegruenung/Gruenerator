import {
  CreateDocumentFAB,
  DocsProvider,
  useDocsAdapter,
  useDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  templates,
  type TemplateType,
} from '@gruenerator/docs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  CardGrid,
  DismissableBanner,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { lazy, memo, Suspense, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FiCloud, FiFile, FiPlus, FiSearch, FiUpload, FiUsers, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { getBoardTemplate } from '../boards/boardTemplates';
import { useBoards } from '../boards/hooks/useBoards';

import { BoardCard } from './BoardCard';
import { webAppDocsAdapter } from './docsAdapter';
import { DocumentCard } from './DocumentCard';
import { TemplateCarousel } from './TemplateCarousel';

import type { Board } from '../boards/types';

const LazyShareModal = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const LazyTemplatePicker = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.TemplatePicker }))
);
const LazyFileImportDialog = lazy(() => import('./FileImportDialog'));
const LazyWolkeImportModal = lazy(() => import('./WolkeImportModal'));

const ImportMenu = memo(function ImportMenu({
  onShowImportDialog,
  onShowWolkeImport,
}: {
  onShowImportDialog: () => void;
  onShowWolkeImport: () => void;
}) {
  const desktopContent = (
    <>
      <DropdownMenuItem onClick={onShowImportDialog}>
        <FiUpload size={16} />
        Datei importieren…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onShowWolkeImport}>
        <FiCloud size={16} />
        Aus Wolke importieren…
      </DropdownMenuItem>
    </>
  );

  const mobileContent = (
    <>
      <ResponsiveMenuItem icon={<FiUpload size={16} />} onClick={onShowImportDialog}>
        Datei importieren…
      </ResponsiveMenuItem>
      <ResponsiveMenuItem icon={<FiCloud size={16} />} onClick={onShowWolkeImport}>
        Aus Wolke importieren…
      </ResponsiveMenuItem>
    </>
  );

  return (
    <ResponsiveMenu
      trigger={
        <Button variant="outline" className="max-sm:h-9 max-sm:w-9 max-sm:p-0 max-sm:rounded-full">
          <FiUpload size={16} />
          <span className="max-sm:hidden">Importieren</span>
        </Button>
      }
      dropdownSide="bottom"
      dropdownAlign="end"
      sheetTitle="Importieren"
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
});

type UnifiedItem =
  | {
      kind: 'document';
      data: {
        id: string;
        title: string;
        updated_at: string;
        document_subtype: string;
        content?: string;
        access_type?: string;
        creator_name?: string;
        group_shares?: Array<{ group_id: string; group_name: string }>;
      };
      sortKey: number;
    }
  | { kind: 'board'; data: Board; sortKey: number };

function DocumentsContent() {
  const adapter = useDocsAdapter();
  const navigate = useNavigate();

  const { data: documents = [], isLoading: docsLoading, error: docsError } = useDocuments();
  const createDocumentMutation = useCreateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const updateDocumentMutation = useUpdateDocument();

  const { boards, isLoading: boardsLoading, createBoard, deleteBoard, updateBoard } = useBoards();

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [showGallery, setShowGallery] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showWolkeImport, setShowWolkeImport] = useState(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    kind: 'document' | 'board';
  } | null>(null);

  const isLoading = docsLoading || boardsLoading;

  const { personalItems, groupDocsByGroup, hasAnyItems } = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const matchesSearch = (title: string) => !query || title.toLowerCase().includes(query);

    const personal: UnifiedItem[] = [];
    const groupMap = new Map<string, { groupName: string; docs: UnifiedItem[] }>();

    for (const doc of documents) {
      if (!matchesSearch(doc.title)) continue;

      const item: UnifiedItem = {
        kind: 'document',
        data: doc,
        sortKey: new Date(doc.updated_at).getTime(),
      };

      if (doc.access_type !== 'group') {
        personal.push(item);
      }

      if (doc.group_shares?.length) {
        for (const gs of doc.group_shares) {
          let entry = groupMap.get(gs.group_id);
          if (!entry) {
            entry = { groupName: gs.group_name, docs: [] };
            groupMap.set(gs.group_id, entry);
          }
          entry.docs.push({ ...item });
        }
      }
    }

    for (const board of boards) {
      if (!matchesSearch(board.title)) continue;
      personal.push({
        kind: 'board',
        data: board,
        sortKey: new Date(board.updated_at).getTime(),
      });
    }

    personal.sort((a, b) => b.sortKey - a.sortKey);

    const sortedGroups = Array.from(groupMap.entries()).sort(([, a], [, b]) =>
      a.groupName.localeCompare(b.groupName, 'de')
    );
    for (const [, group] of sortedGroups) {
      group.docs.sort((a, b) => b.sortKey - a.sortKey);
    }

    return {
      personalItems: personal,
      groupDocsByGroup: sortedGroups,
      hasAnyItems: documents.length > 0 || boards.length > 0,
    };
  }, [documents, boards, deferredSearch]);

  const hasFilteredResults = personalItems.length > 0 || groupDocsByGroup.length > 0;

  const handleTemplateSelect = useCallback(
    async (templateType: TemplateType) => {
      setShowGallery(false);
      try {
        const template = templates.find((t) => t.id === templateType);
        const title = template?.defaultTitle || 'Neues Dokument';
        const newDoc = await createDocumentMutation.mutateAsync({
          title,
          documentSubtype: templateType,
        });
        adapter.navigateToDocument(newDoc.id);
      } catch (err) {
        console.error('Failed to create document:', err);
      }
    },
    [createDocumentMutation, adapter]
  );

  const handleDelete = useCallback(
    (id: string, kind: 'document' | 'board', e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteTarget({ id, kind });
    },
    []
  );

  const handleDeleteDoc = useCallback(
    (id: string, e: React.MouseEvent) => handleDelete(id, 'document', e),
    [handleDelete]
  );

  const handleRenameDoc = useCallback(
    async (doc: { id: string; title: string }, e: React.MouseEvent) => {
      e.stopPropagation();
      const newTitle = window.prompt('Neuer Titel:', doc.title);
      if (newTitle?.trim() && newTitle.trim() !== doc.title) {
        try {
          await updateDocumentMutation.mutateAsync({
            id: doc.id,
            updates: { title: newTitle.trim() },
          });
        } catch (err) {
          console.error('Failed to rename document:', err);
        }
      }
    },
    [updateDocumentMutation]
  );

  const handleDeleteBoard = useCallback(
    (id: string, e: React.MouseEvent) => handleDelete(id, 'board', e),
    [handleDelete]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id, kind } = deleteTarget;
    setDeleteTarget(null);
    try {
      if (kind === 'document') {
        await deleteDocumentMutation.mutateAsync(id);
      } else {
        await deleteBoard.mutateAsync(id);
      }
    } catch (err) {
      console.error(`Failed to delete ${kind}:`, err);
    }
  }, [deleteTarget, deleteDocumentMutation, deleteBoard]);

  const handleRenameBoard = useCallback(
    (board: { id: string; title: string }, e: React.MouseEvent) => {
      e.stopPropagation();
      const newTitle = window.prompt('Neuer Titel:', board.title);
      if (newTitle?.trim() && newTitle.trim() !== board.title) {
        updateBoard.mutate({ id: board.id, title: newTitle.trim() });
      }
    },
    [updateBoard]
  );

  const handleCreateBoard = useCallback(
    (boardType: 'kanban' | 'whiteboard') => {
      const title = boardType === 'whiteboard' ? 'Neues Whiteboard' : 'Neues Board';
      createBoard.mutate(
        { title, boardType },
        { onSuccess: (board) => navigate(`/boards/${board.id}`) }
      );
    },
    [createBoard, navigate]
  );

  const handleCreateBoardFromTemplate = useCallback(
    (templateId: string) => {
      const template = getBoardTemplate(templateId);
      if (!template) return;
      createBoard.mutate(
        { title: template.defaultTitle, boardType: 'kanban' },
        {
          onSuccess: (board) =>
            navigate(`/boards/${board.id}`, {
              state: { generatedStructure: template.structure },
            }),
        }
      );
    },
    [createBoard, navigate]
  );

  return (
    <>
      <div className="mb-md mt-md flex items-center gap-sm">
        <h1 className="m-0 shrink-0 text-2xl font-semibold text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif]">
          Dokumente
        </h1>
        <div className="relative min-w-0 flex-1 max-w-[500px] mx-auto">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-400" />
          <input
            type="text"
            placeholder="Durchsuchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-grey-200 bg-grey-50 py-2 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-grey-400 focus:border-secondary-600 focus:ring-1 focus:ring-secondary-600/30 dark:border-grey-700 dark:bg-grey-800 dark:focus:border-secondary-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Suche zurücksetzen"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-grey-400 hover:bg-grey-100 hover:text-grey-600 dark:hover:bg-grey-800"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
        <ImportMenu
          onShowImportDialog={() => setShowImportDialog(true)}
          onShowWolkeImport={() => setShowWolkeImport(true)}
        />
      </div>

      <DismissableBanner
        storageKey="gruenerator_docs_experimental_warning_dismissed"
        variant="warning"
        className="mb-md"
      >
        <strong>Experimentelles Feature</strong> — Diese Funktion befindet sich noch in der
        Entwicklung. Bitte behalte eine lokale Sicherungskopie deiner Dateien.
      </DismissableBanner>

      <main>
        <TemplateCarousel
          onTemplateSelect={handleTemplateSelect}
          onShowGallery={() => setShowGallery(true)}
          onCreateBoardFromTemplate={handleCreateBoardFromTemplate}
          onCreateWhiteboard={() => handleCreateBoard('whiteboard')}
        />

        {isLoading ? (
          <CardGrid columns="auto" gap="md">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[140px] animate-pulse rounded-xl border border-grey-200 bg-grey-100 dark:border-grey-700 dark:bg-grey-800"
              />
            ))}
          </CardGrid>
        ) : docsError ? (
          <p className="py-12 text-center text-red-600 dark:text-red-400">{docsError.message}</p>
        ) : !hasAnyItems ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-grey-500 dark:text-grey-400">
            <FiFile size={40} className="text-grey-300 dark:text-grey-600" />
            <p className="text-[0.9375rem]">Noch keine Inhalte vorhanden.</p>
            <Button onClick={() => handleTemplateSelect('blank')}>
              <FiPlus size={16} />
              Erstes Dokument erstellen
            </Button>
          </div>
        ) : !hasFilteredResults ? (
          <p className="py-12 text-center text-grey-500 dark:text-grey-400">
            Keine Ergebnisse gefunden.
          </p>
        ) : (
          <>
            {personalItems.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                {personalItems.map((item) => {
                  if (item.kind === 'document')
                    return (
                      <DocumentCard
                        key={`doc-${item.data.id}`}
                        doc={item.data}
                        adapter={adapter}
                        onDelete={handleDeleteDoc}
                        onRename={handleRenameDoc}
                        onShare={setShareDoc}
                      />
                    );
                  return (
                    <BoardCard
                      key={`board-${item.data.id}`}
                      board={item.data}
                      onDelete={handleDeleteBoard}
                      onRename={handleRenameBoard}
                    />
                  );
                })}
              </div>
            )}

            {groupDocsByGroup.map(([groupId, { groupName, docs }]) => (
              <div key={groupId} className="mt-xl">
                <h2 className="mb-sm flex items-center gap-xs text-sm font-medium text-grey-500 dark:text-grey-400">
                  <FiUsers size={14} />
                  {groupName}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                  {docs.map((item) => {
                    if (item.kind !== 'document') return null;
                    return (
                      <DocumentCard
                        key={`doc-${item.data.id}-${groupId}`}
                        doc={item.data}
                        adapter={adapter}
                        onDelete={handleDeleteDoc}
                        onRename={handleRenameDoc}
                        onShare={setShareDoc}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </main>

      <CreateDocumentFAB
        onCreateBlank={() => handleTemplateSelect('blank')}
        onShowGallery={() => setShowGallery(true)}
      />

      {showGallery && (
        <Suspense fallback={null}>
          <LazyTemplatePicker
            onSelect={handleTemplateSelect}
            onClose={() => setShowGallery(false)}
          />
        </Suspense>
      )}

      {shareDoc && (
        <Suspense fallback={null}>
          <LazyShareModal
            documentId={shareDoc.id}
            documentTitle={shareDoc.title}
            onClose={() => setShareDoc(null)}
          />
        </Suspense>
      )}

      {showImportDialog && (
        <Suspense fallback={null}>
          <LazyFileImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />
        </Suspense>
      )}

      {showWolkeImport && (
        <Suspense fallback={null}>
          <LazyWolkeImportModal open={showWolkeImport} onOpenChange={setShowWolkeImport} />
        </Suspense>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === 'board' ? 'Board' : 'Dokument'} löschen
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dieses {deleteTarget?.kind === 'board' ? 'Board' : 'Dokument'} wird unwiderruflich
              gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const DocsPage = () => (
  <ErrorBoundary>
    <PageContainer maxWidth="lg" noPadTop className="max-md:pt-lg">
      <DocsProvider adapter={webAppDocsAdapter}>
        <DocumentsContent />
      </DocsProvider>
    </PageContainer>
  </ErrorBoundary>
);

const DocsPageFallback = () => (
  <PageContainer maxWidth="lg" noPadTop>
    <div className="mb-md">
      <h1 className="m-0 text-2xl font-semibold text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif]">
        Dokumente
      </h1>
    </div>
  </PageContainer>
);

export default withAuthRequired(DocsPage, {
  title: 'Dokumente',
  fallback: <DocsPageFallback />,
});
