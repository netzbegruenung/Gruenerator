import {
  DocsProvider,
  useDocsAdapter,
  useDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  useGenerateDocument,
  templates,
  type TemplateType,
} from '@gruenerator/docs';
import { instantiateUserTemplate, type UserTemplateSummary } from '@gruenerator/shared';
import { getContractsClient } from '@gruenerator/shared/api';
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
} from '@gruenerator/ui';
import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiFile, FiPlus, FiUsers } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../components/ErrorBoundary';
import { useBoardsTyped } from '../../hooks/useBoardsTyped';
import { useFirstName } from '../../hooks/useFirstName';
import { boardTemplates, getBoardTemplate } from '../boards/boardTemplates';
import {
  getPresentationTemplate,
  presentationTemplates,
} from '../presentations/presentationTemplates';
import { getSheetTemplate, sheetTemplates } from '../sheets/sheetTemplates';

import { BoardCard } from './BoardCard';
import { webAppDocsAdapter } from './docsAdapter';
import {
  DocsComposer,
  type ComposerItem,
  type ComposerTemplate,
  type ImportKind,
} from './DocsComposer';
import { subtypeToKind, type DocKind } from './docTypeMeta';
import { DocumentCard } from './DocumentCard';

import type { Board } from '../boards/types';

const LazyShareModal = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const LazyTemplateGalleryModal = lazy(() => import('./TemplateGalleryModal'));
const LazyFileImportDialog = lazy(() => import('./FileImportDialog'));
const LazySheetImportDialog = lazy(() => import('../sheets/SheetImportDialog'));
const LazyWolkeImportModal = lazy(() => import('./WolkeImportModal'));

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

// Personal documents collapse to this many rows; "Alle anzeigen" reveals the rest
// so the group sections below stay reachable without scrolling past a long grid.
const COLLAPSED_ROWS = 2;

// Counts the resolved columns of an auto-fill grid so "2 rows" is correct at any
// viewport width. auto-fill generates the full set of tracks even when empty, so
// the measurement holds regardless of how many items are currently rendered.
function useGridColumns(ref: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColumns(tracks);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

function DocumentsContent() {
  const adapter = useDocsAdapter();
  const navigate = useNavigate();
  const firstName = useFirstName();

  const { data: documents = [], isLoading: docsLoading, error: docsError } = useDocuments();
  const createDocumentMutation = useCreateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const updateDocumentMutation = useUpdateDocument();
  const generateDocumentMutation = useGenerateDocument();

  const {
    boards,
    isLoading: boardsLoading,
    createBoard,
    deleteBoard,
    updateBoard,
    generateBoard,
  } = useBoardsTyped();

  const [showGallery, setShowGallery] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSheetImport, setShowSheetImport] = useState(false);
  const [showWolkeImport, setShowWolkeImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    kind: 'document' | 'board';
  } | null>(null);

  const isLoading = docsLoading || boardsLoading;

  const { personalItems, groupDocsByGroup, hasAnyItems } = useMemo(() => {
    const personal: UnifiedItem[] = [];
    const groupMap = new Map<string, { groupName: string; docs: UnifiedItem[] }>();

    for (const doc of documents) {
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
  }, [documents, boards]);

  const personalGridRef = useRef<HTMLDivElement>(null);
  const personalColumns = useGridColumns(personalGridRef);
  const [showAllPersonal, setShowAllPersonal] = useState(false);
  // Until columns are measured (or with no groups to make room for), show everything.
  const collapsedCount =
    personalColumns > 0 && groupDocsByGroup.length > 0
      ? personalColumns * COLLAPSED_ROWS
      : personalItems.length;
  const visiblePersonalItems = showAllPersonal
    ? personalItems
    : personalItems.slice(0, collapsedCount);
  const hiddenPersonalCount = personalItems.length - visiblePersonalItems.length;

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

  const handleCreateSheet = useCallback(async () => {
    try {
      const newDoc = await createDocumentMutation.mutateAsync({
        title: 'Neue Tabelle',
        documentSubtype: 'sheets',
      });
      adapter.navigateToDocument(newDoc.id);
    } catch (err) {
      console.error('Failed to create sheet:', err);
    }
  }, [createDocumentMutation, adapter]);

  const handleCreateSheetFromTemplate = useCallback(
    async (templateId: string) => {
      const template = getSheetTemplate(templateId);
      if (!template) return;
      try {
        const newDoc = await createDocumentMutation.mutateAsync({
          title: template.defaultTitle,
          documentSubtype: 'sheets',
        });
        // SPA navigation (not adapter.navigateToDocument, which reloads and
        // drops nav-state): the seed workbook rides `location.state` into the
        // Univer editor, which applies it on first open.
        navigate(`/office/${newDoc.id}`, { state: { sheetTemplate: template.workbook } });
      } catch (err) {
        console.error('Failed to create sheet from template:', err);
      }
    },
    [createDocumentMutation, navigate]
  );

  const handleCreatePresentation = useCallback(async () => {
    try {
      const newDoc = await createDocumentMutation.mutateAsync({
        title: 'Neue Präsentation',
        documentSubtype: 'presentations',
      });
      adapter.navigateToDocument(newDoc.id);
    } catch (err) {
      console.error('Failed to create presentation:', err);
    }
  }, [createDocumentMutation, adapter]);

  const handleCreatePresentationFromTemplate = useCallback(
    async (templateId: string) => {
      const template = getPresentationTemplate(templateId);
      if (!template) return;
      try {
        const newDoc = await createDocumentMutation.mutateAsync({
          title: template.defaultTitle,
          documentSubtype: 'presentations',
        });
        // SPA navigation carries the seed slides via nav-state into the editor.
        navigate(`/office/${newDoc.id}`, { state: { presentationTemplate: template.slides } });
      } catch (err) {
        console.error('Failed to create presentation from template:', err);
      }
    },
    [createDocumentMutation, navigate]
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

  const handleUserTemplateSelect = useCallback(
    async (template: UserTemplateSummary) => {
      try {
        const result = await instantiateUserTemplate({
          templateId: template.id,
          title: template.title,
        });
        if (result.subtype === 'boards') {
          void navigate(`/boards/${result.documentId}`);
        } else {
          adapter.navigateToDocument(result.documentId);
        }
      } catch (err) {
        console.error('Failed to instantiate user template:', err);
      }
    },
    [adapter, navigate]
  );

  // Composer → AI-generate the detected kind. Docs/boards have dedicated
  // one-shot generators (useGenerateDocument / boards.generate); sheets and
  // presentations use the direct /api/{sheets,presentations}/generate endpoints
  // (Y.Doc seeded server-side, so the editor opens fully populated).
  const handleComposerCreate = useCallback(
    async (kind: DocKind, prompt: string) => {
      const description = prompt.trim();
      // Ref, not the `creating` state: Enter and the send button can both fire
      // before React re-renders, and a stale closure would let both through.
      if (!description || creatingRef.current) return;
      creatingRef.current = true;
      setCreating(true);
      try {
        if (kind === 'doc') {
          const doc = await generateDocumentMutation.mutateAsync(description);
          navigate(`/office/${doc.id}`);
        } else if (kind === 'board') {
          const data = await generateBoard.mutateAsync(description);
          navigate(
            `/boards/${data.board.id}`,
            data.generatedStructure
              ? { state: { generatedStructure: data.generatedStructure } }
              : {}
          );
        } else if (kind === 'sheet') {
          const res = await getContractsClient().sheets.generate({ body: { description } });
          if (res.status !== 201) throw new Error(`Sheet generation failed (${res.status})`);
          navigate(`/office/${res.body.id}`);
        } else {
          const res = await getContractsClient().presentations.generate({ body: { description } });
          if (res.status !== 201) throw new Error(`Presentation generation failed (${res.status})`);
          navigate(`/office/${res.body.id}`);
        }
      } catch (err) {
        console.error('Composer create failed:', err);
      } finally {
        // Always release: on success we navigate away, but if the route resolves
        // back to /docs the composer would otherwise stay disabled forever.
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [generateDocumentMutation, generateBoard, navigate]
  );

  const handleComposerTemplate = useCallback(
    (kind: DocKind, id: string) => {
      if (kind === 'doc') void handleTemplateSelect(id as TemplateType);
      else if (kind === 'board') handleCreateBoardFromTemplate(id);
      else if (kind === 'sheet') void handleCreateSheetFromTemplate(id);
      else void handleCreatePresentationFromTemplate(id);
    },
    [
      handleTemplateSelect,
      handleCreateBoardFromTemplate,
      handleCreateSheetFromTemplate,
      handleCreatePresentationFromTemplate,
    ]
  );

  const handleComposerImport = useCallback((kind: ImportKind) => {
    if (kind === 'file') setShowImportDialog(true);
    else if (kind === 'sheet') setShowSheetImport(true);
    else setShowWolkeImport(true);
  }, []);

  const composerItems: ComposerItem[] = useMemo(() => {
    const docItems = documents.map((d) => ({
      id: d.id,
      title: d.title,
      kind: subtypeToKind(d.document_subtype),
      openPath: `/office/${d.id}`,
      sortKey: new Date(d.updated_at).getTime(),
    }));
    const boardItems = boards.map((b) => ({
      id: b.id,
      title: b.title,
      kind: 'board' as const,
      openPath: `/boards/${b.id}`,
      sortKey: new Date(b.updated_at).getTime(),
    }));
    return [...docItems, ...boardItems]
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(({ sortKey: _sortKey, ...rest }) => rest);
  }, [documents, boards]);

  const composerTemplates: ComposerTemplate[] = useMemo(
    () => [
      ...templates
        .filter((t) => t.id !== 'blank')
        .map((t) => ({
          key: `doc-${t.id}`,
          kind: 'doc' as const,
          id: t.id,
          title: t.name,
          description: t.description,
        })),
      ...boardTemplates.map((t) => ({
        key: `board-${t.id}`,
        kind: 'board' as const,
        id: t.id,
        title: t.name,
        description: t.description,
      })),
      ...sheetTemplates.map((t) => ({
        key: `sheet-${t.id}`,
        kind: 'sheet' as const,
        id: t.id,
        title: t.name,
        description: t.description,
      })),
      ...presentationTemplates.map((t) => ({
        key: `pres-${t.id}`,
        kind: 'pres' as const,
        id: t.id,
        title: t.name,
        description: t.description,
      })),
    ],
    []
  );

  return (
    <>
      <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
        <h1 className="text-center text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif] [text-wrap:balance] max-sm:text-2xl">
          {firstName
            ? `Willkommen im neuen Grünerator KI-Office, ${firstName}`
            : 'Willkommen im neuen Grünerator KI-Office'}
        </h1>

        <DocsComposer
          items={composerItems}
          templates={composerTemplates}
          isGenerating={creating}
          onGenerate={handleComposerCreate}
          onSelectTemplate={handleComposerTemplate}
          onImport={handleComposerImport}
        />

        <div className="mt-[18px] text-center">
          <button
            type="button"
            onClick={() => setShowGallery(true)}
            className="text-[13.5px] font-semibold text-[#4C8A6E] transition-colors hover:text-[#3E7A5F]"
          >
            oder wähle aus einer Vorlage
          </button>
        </div>
      </div>

      <DismissableBanner
        storageKey="gruenerator_docs_experimental_warning_dismissed"
        variant="warning"
        className="mb-md mt-lg"
      >
        <strong>Experimentelles Feature</strong> — Diese Funktion befindet sich noch in der
        Entwicklung. Bitte behalte eine lokale Sicherungskopie deiner Dateien.
      </DismissableBanner>

      <section>
        {isLoading ? (
          <CardGrid columns="auto" gap="md">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[240px] animate-pulse rounded-xl border border-grey-200 bg-grey-100 dark:border-grey-700 dark:bg-grey-800"
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
        ) : (
          <>
            {personalItems.length > 0 && (
              <>
                <div className="mb-sm mt-xl flex items-baseline gap-3">
                  <h2 className="text-base font-extrabold text-foreground">Zuletzt bearbeitet</h2>
                </div>
                <div
                  ref={personalGridRef}
                  className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
                >
                  {visiblePersonalItems.map((item) => {
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
                {(hiddenPersonalCount > 0 || showAllPersonal) && (
                  <div className="mt-md flex justify-center">
                    <Button variant="ghost" onClick={() => setShowAllPersonal((prev) => !prev)}>
                      {showAllPersonal ? (
                        <>
                          <FiChevronUp size={16} />
                          Weniger anzeigen
                        </>
                      ) : (
                        <>
                          <FiChevronDown size={16} />
                          Alle anzeigen ({hiddenPersonalCount})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}

            {groupDocsByGroup.map(([groupId, { groupName, docs }]) => (
              <div key={groupId} className="mt-xl">
                <h2 className="mb-sm flex items-center gap-xs text-sm font-medium text-grey-500 dark:text-grey-400">
                  <FiUsers size={14} />
                  {groupName}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
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
      </section>

      {showGallery && (
        <Suspense fallback={null}>
          <LazyTemplateGalleryModal
            onClose={() => setShowGallery(false)}
            onCreateBlank={(kind) => {
              if (kind === 'doc') void handleTemplateSelect('blank');
              else if (kind === 'board') handleCreateBoard('kanban');
              else if (kind === 'sheet') void handleCreateSheet();
              else void handleCreatePresentation();
            }}
            onSelectDocTemplate={(id) => void handleTemplateSelect(id)}
            onSelectBoardTemplate={handleCreateBoardFromTemplate}
            onSelectSheetTemplate={(id) => void handleCreateSheetFromTemplate(id)}
            onSelectPresentationTemplate={(id) => void handleCreatePresentationFromTemplate(id)}
            onSelectUserTemplate={handleUserTemplateSelect}
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

      {showSheetImport && (
        <Suspense fallback={null}>
          <LazySheetImportDialog open={showSheetImport} onOpenChange={setShowSheetImport} />
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

/** Office start page without route chrome — embedded by the workplace
 * "Arbeiten" tab (/workplace/arbeiten), which provides PageContainer + auth. */
export const DocsHome = () => (
  <ErrorBoundary>
    <DocsProvider adapter={webAppDocsAdapter}>
      <DocumentsContent />
    </DocsProvider>
  </ErrorBoundary>
);
