import {
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
  SlidesProvider,
  useSlidesAdapter,
  createSlidesApiClient,
  usePresentationStore,
  type Presentation,
  type GeneratePresentationResponse,
} from '@gruenerator/slides';
import {
  AIPromptInput,
  Button,
  CardGrid,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  FiArrowLeft,
  FiCloud,
  FiFile,
  FiGrid,
  FiPlus,
  FiSearch,
  FiUpload,
  FiUsers,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { PiKanban, PiPencilLine } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { getBoardTemplate } from '../boards/boardTemplates';
import { useBoards } from '../boards/hooks/useBoards';

import { BoardCard } from './BoardCard';
import { webAppDocsAdapter } from './docsAdapter';
import { DocumentCard } from './DocumentCard';
import { PresentationCard } from './PresentationCard';
import { webAppSlidesAdapter } from './slidesAdapter';
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

const SLIDE_EXAMPLES = [
  {
    label: 'Klimaschutz',
    text: 'Präsentation über kommunale Klimaschutzmaßnahmen und deren Umsetzung',
  },
  { label: 'Verkehrswende', text: 'Verkehrswende in der Stadt: Fahrrad, ÖPNV und autofreie Zonen' },
  {
    label: 'Quartalsbericht',
    text: 'Quartalsbericht unserer Fraktion: Erfolge, Anträge und Ausblick',
  },
];

const CreateNewMenu = memo(function CreateNewMenu({
  onTemplateSelect,
  onShowGallery,
  onShowImportDialog,
  onShowWolkeImport,
  onShowGenerateSlides,
  onCreateBoard,
}: {
  onTemplateSelect: (type: TemplateType) => void;
  onShowGallery: () => void;
  onShowImportDialog: () => void;
  onShowWolkeImport: () => void;
  onShowGenerateSlides: () => void;
  onCreateBoard: (type: 'kanban' | 'whiteboard') => void;
}) {
  const desktopContent = (
    <>
      <DropdownMenuLabel>Dokument</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => onTemplateSelect('blank')}>
        <FiFile size={16} />
        Leeres Dokument
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onShowGallery}>
        <FiGrid size={16} />
        Aus Vorlage…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onShowImportDialog}>
        <FiUpload size={16} />
        Datei importieren…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onShowWolkeImport}>
        <FiCloud size={16} />
        Aus Wolke importieren…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* <DropdownMenuLabel>Präsentation</DropdownMenuLabel>
      <DropdownMenuItem onClick={onShowGenerateSlides}>
        <FiZap size={16} />
        KI-Präsentation erstellen
      </DropdownMenuItem>
      <DropdownMenuSeparator /> */}
      <DropdownMenuLabel>Board</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => onCreateBoard('kanban')}>
        <PiKanban size={16} />
        Neues Board
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onCreateBoard('whiteboard')}>
        <PiPencilLine size={16} />
        Neues Whiteboard
      </DropdownMenuItem>
    </>
  );

  const mobileContent = (
    <>
      <ResponsiveMenuSection title="Dokument">
        <ResponsiveMenuItem icon={<FiFile size={16} />} onClick={() => onTemplateSelect('blank')}>
          Leeres Dokument
        </ResponsiveMenuItem>
        <ResponsiveMenuItem icon={<FiGrid size={16} />} onClick={onShowGallery}>
          Aus Vorlage…
        </ResponsiveMenuItem>
        <ResponsiveMenuItem icon={<FiUpload size={16} />} onClick={onShowImportDialog}>
          Datei importieren…
        </ResponsiveMenuItem>
        <ResponsiveMenuItem icon={<FiCloud size={16} />} onClick={onShowWolkeImport}>
          Aus Wolke importieren…
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>
      {/* <ResponsiveMenuSection title="Präsentation">
        <ResponsiveMenuItem icon={<FiZap size={16} />} onClick={onShowGenerateSlides}>
          KI-Präsentation erstellen
        </ResponsiveMenuItem>
      </ResponsiveMenuSection> */}
      <ResponsiveMenuSection title="Board">
        <ResponsiveMenuItem icon={<PiKanban size={16} />} onClick={() => onCreateBoard('kanban')}>
          Neues Board
        </ResponsiveMenuItem>
        <ResponsiveMenuItem
          icon={<PiPencilLine size={16} />}
          onClick={() => onCreateBoard('whiteboard')}
        >
          Neues Whiteboard
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>
    </>
  );

  return (
    <ResponsiveMenu
      trigger={
        <Button>
          <FiPlus size={16} />
          Neu
        </Button>
      }
      dropdownSide="bottom"
      dropdownAlign="end"
      sheetTitle="Neu erstellen"
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
  | { kind: 'presentation'; data: Presentation; sortKey: number }
  | { kind: 'board'; data: Board; sortKey: number };

function GenerateSlidesForm({
  onBack,
  onGenerated,
}: {
  onBack: () => void;
  onGenerated: (id: string) => void;
}) {
  const adapter = useSlidesAdapter();
  const apiClient = useMemo(() => createSlidesApiClient(adapter), [adapter]);

  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>('');

  const handleGenerate = useCallback(async () => {
    if (!content.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const result = await apiClient.post<GeneratePresentationResponse>('/presentations/generate', {
        content: content.trim(),
        tone: 'professional',
        verbosity: 'standard',
        nSlides: 8,
        language: 'Deutsch',
        instructions: null,
        includeTitleSlide: true,
        includeTableOfContents: false,
      });
      onGenerated(result.presentationId);
    } catch (err) {
      setIsGenerating(false);
      setErrorMsg((err as Error).message || 'Fehler bei der Erstellung');
    }
  }, [content, apiClient, onGenerated]);

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-lg flex items-center gap-1.5 text-sm text-grey-500 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
      >
        <FiArrowLeft size={16} />
        Zurück
      </button>

      <div className="text-center mb-lg">
        <h2 className="text-2xl font-semibold text-foreground-heading mb-xs">
          KI-Präsentation erstellen
        </h2>
        <p className="text-sm text-grey-500">Beschreibe das Thema — die KI erstellt die Folien.</p>
      </div>

      <AIPromptInput
        value={content}
        onChange={setContent}
        onSubmit={handleGenerate}
        placeholder="Worüber soll die Präsentation sein?"
        isLoading={isGenerating}
        examples={SLIDE_EXAMPLES}
        error={errorMsg}
        rows={3}
      />

      {isGenerating && (
        <p className="text-center text-xs text-grey-400 mt-3">
          Das kann bis zu 30 Sekunden dauern…
        </p>
      )}
    </div>
  );
}

function DocumentsContent() {
  const adapter = useDocsAdapter();
  const slidesAdapter = useSlidesAdapter();
  const navigate = useNavigate();

  const { data: documents = [], isLoading: docsLoading, error: docsError } = useDocuments();
  const createDocumentMutation = useCreateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const updateDocumentMutation = useUpdateDocument();

  const { boards, isLoading: boardsLoading, createBoard, deleteBoard, updateBoard } = useBoards();

  const slidesApiClient = useMemo(() => createSlidesApiClient(slidesAdapter), [slidesAdapter]);
  const presentations = usePresentationStore((s) => s.presentations);
  const presentationsLoading = usePresentationStore((s) => s.isLoading);
  const fetchPresentations = usePresentationStore((s) => s.fetchPresentations);
  const storeDeletePresentation = usePresentationStore((s) => s.deletePresentation);
  const storeUpdatePresentation = usePresentationStore((s) => s.updatePresentation);

  useEffect(() => {
    fetchPresentations(slidesApiClient);
  }, [fetchPresentations, slidesApiClient]);

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [showGallery, setShowGallery] = useState(false);
  const [showGenerateSlides, setShowGenerateSlides] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showWolkeImport, setShowWolkeImport] = useState(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);

  const isLoading = docsLoading || boardsLoading || presentationsLoading;

  const { personalItems, groupDocsByGroup, hasAnyItems } = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const matchesSearch = (title: string) => !query || title.toLowerCase().includes(query);

    const personal: UnifiedItem[] = [];
    const groupMap = new Map<string, { groupName: string; docs: UnifiedItem[] }>();

    for (const doc of documents) {
      if (!matchesSearch(doc.title)) continue;

      if (doc.access_type === 'group' && doc.group_shares?.length) {
        for (const gs of doc.group_shares) {
          let entry = groupMap.get(gs.group_id);
          if (!entry) {
            entry = { groupName: gs.group_name, docs: [] };
            groupMap.set(gs.group_id, entry);
          }
          entry.docs.push({
            kind: 'document',
            data: doc,
            sortKey: new Date(doc.updated_at).getTime(),
          });
        }
      } else {
        personal.push({
          kind: 'document',
          data: doc,
          sortKey: new Date(doc.updated_at).getTime(),
        });
      }
    }

    for (const pres of presentations) {
      if (!matchesSearch(pres.title)) continue;
      personal.push({
        kind: 'presentation',
        data: pres,
        sortKey: new Date(pres.updatedAt).getTime(),
      });
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
      hasAnyItems: documents.length > 0 || presentations.length > 0 || boards.length > 0,
    };
  }, [documents, presentations, boards, deferredSearch]);

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

  const handleDeleteDoc = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm('Dokument wirklich löschen?')) {
        try {
          await deleteDocumentMutation.mutateAsync(id);
        } catch (err) {
          console.error('Failed to delete document:', err);
        }
      }
    },
    [deleteDocumentMutation]
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

  const handleDeletePresentation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm('Präsentation wirklich löschen?')) {
        try {
          await storeDeletePresentation(slidesApiClient, id);
        } catch (err) {
          console.error('Failed to delete presentation:', err);
        }
      }
    },
    [storeDeletePresentation, slidesApiClient]
  );

  const handleRenamePresentation = useCallback(
    async (pres: { id: string; title: string }, e: React.MouseEvent) => {
      e.stopPropagation();
      const newTitle = window.prompt('Neuer Titel:', pres.title);
      if (newTitle?.trim() && newTitle.trim() !== pres.title) {
        try {
          await storeUpdatePresentation(slidesApiClient, pres.id, { title: newTitle.trim() });
        } catch (err) {
          console.error('Failed to rename presentation:', err);
        }
      }
    },
    [storeUpdatePresentation, slidesApiClient]
  );

  const handleDeleteBoard = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm('Board wirklich löschen?')) {
        deleteBoard.mutate(id);
      }
    },
    [deleteBoard]
  );

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

  if (showGenerateSlides) {
    return (
      <GenerateSlidesForm
        onBack={() => setShowGenerateSlides(false)}
        onGenerated={(id) => {
          setShowGenerateSlides(false);
          navigate(`/docs/presentation/${id}`);
        }}
      />
    );
  }

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
        <CreateNewMenu
          onTemplateSelect={handleTemplateSelect}
          onShowGallery={() => setShowGallery(true)}
          onShowImportDialog={() => setShowImportDialog(true)}
          onShowWolkeImport={() => setShowWolkeImport(true)}
          onShowGenerateSlides={() => setShowGenerateSlides(true)}
          onCreateBoard={handleCreateBoard}
        />
      </div>

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
                  if (item.kind === 'presentation')
                    return (
                      <PresentationCard
                        key={`pres-${item.data.id}`}
                        presentation={item.data}
                        onDelete={handleDeletePresentation}
                        onRename={handleRenamePresentation}
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
    </>
  );
}

const DocsPage = () => (
  <ErrorBoundary>
    <PageContainer maxWidth="lg" noPadTop>
      <DocsProvider adapter={webAppDocsAdapter}>
        <SlidesProvider adapter={webAppSlidesAdapter}>
          <DocumentsContent />
        </SlidesProvider>
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
