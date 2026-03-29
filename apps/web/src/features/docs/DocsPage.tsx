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
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  FiArrowLeft,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiCloud,
  FiEdit2,
  FiEdit3,
  FiFile,
  FiFileText,
  FiGrid,
  FiMail,
  FiMonitor,
  FiMoreVertical,
  FiPlus,
  FiRadio,
  FiSearch,
  FiShare2,
  FiTrash2,
  FiUpload,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { PiKanban, PiPencilLine } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useBoards } from '../boards/hooks/useBoards';
import { getBoardType } from '../boards/types';

import { webAppDocsAdapter } from './docsAdapter';
import { webAppSlidesAdapter } from './slidesAdapter';

import type { Board } from '../boards/types';

const LazyShareModal = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const LazyTemplatePicker = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.TemplatePicker }))
);
const LazyFileImportDialog = lazy(() => import('./FileImportDialog'));
const LazyWolkeImportModal = lazy(() => import('./WolkeImportModal'));

const DOC_TYPE_STYLE: Record<
  string,
  { icon: React.ComponentType<{ size?: number; className?: string }>; bg: string; text: string }
> = {
  blank: { icon: FiFile, bg: 'bg-grey-100 dark:bg-grey-800', text: 'text-grey-500' },
  antrag: {
    icon: FiFileText,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  pressemitteilung: {
    icon: FiRadio,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  protokoll: {
    icon: FiClipboard,
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
  },
  notizen: {
    icon: FiEdit3,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  redaktionsplan: {
    icon: FiCalendar,
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-600 dark:text-teal-400',
  },
  checkliste: {
    icon: FiCheckSquare,
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
  },
  einladung: {
    icon: FiMail,
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

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

  const { boards, isLoading: boardsLoading, createBoard } = useBoards();

  const slidesApiClient = useMemo(() => createSlidesApiClient(slidesAdapter), [slidesAdapter]);
  const presentations = usePresentationStore((s) => s.presentations);
  const presentationsLoading = usePresentationStore((s) => s.isLoading);
  const fetchPresentations = usePresentationStore((s) => s.fetchPresentations);

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

  const unifiedItems = useMemo(() => {
    const items: UnifiedItem[] = [];

    for (const doc of documents) {
      items.push({
        kind: 'document',
        data: doc,
        sortKey: new Date(doc.updated_at).getTime(),
      });
    }
    for (const pres of presentations) {
      items.push({
        kind: 'presentation',
        data: pres,
        sortKey: new Date(pres.updatedAt).getTime(),
      });
    }
    for (const board of boards) {
      items.push({
        kind: 'board',
        data: board,
        sortKey: new Date(board.updated_at).getTime(),
      });
    }

    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
  }, [documents, presentations, boards]);

  const filteredItems = useMemo(() => {
    if (!deferredSearch.trim()) return unifiedItems;
    const query = deferredSearch.trim().toLowerCase();
    return unifiedItems.filter((item) => {
      const title = item.data.title;
      return title.toLowerCase().includes(query);
    });
  }, [unifiedItems, deferredSearch]);

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

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Dokument wirklich löschen?')) {
      try {
        await deleteDocumentMutation.mutateAsync(id);
      } catch (err) {
        console.error('Failed to delete document:', err);
      }
    }
  };

  const handleRenameDoc = async (doc: { id: string; title: string }, e: React.MouseEvent) => {
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
  };

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

  const createMenuContent = (
    <>
      <DropdownMenuLabel>Dokument</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => handleTemplateSelect('blank')}>
        <FiFile size={16} />
        Leeres Dokument
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setShowGallery(true)}>
        <FiGrid size={16} />
        Aus Vorlage…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
        <FiUpload size={16} />
        Datei importieren…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setShowWolkeImport(true)}>
        <FiCloud size={16} />
        Aus Wolke importieren…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Präsentation</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => setShowGenerateSlides(true)}>
        <FiZap size={16} />
        KI-Präsentation erstellen
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Board</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => handleCreateBoard('kanban')}>
        <PiKanban size={16} />
        Neues Board
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleCreateBoard('whiteboard')}>
        <PiPencilLine size={16} />
        Neues Whiteboard
      </DropdownMenuItem>
    </>
  );

  return (
    <>
      <div className="mb-md mt-md">
        <div className="flex flex-wrap items-center justify-between gap-sm mb-md">
          <h1 className="m-0 text-2xl font-semibold text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif]">
            Dokumente
          </h1>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[300px] md:min-w-[400px]">
              <FiSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-400"
              />
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="max-sm:hidden">
                  <FiPlus size={16} />
                  Neu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{createMenuContent}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <main>
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
        ) : unifiedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-grey-500 dark:text-grey-400">
            <FiFile size={40} className="text-grey-300 dark:text-grey-600" />
            <p className="text-[0.9375rem]">Noch keine Inhalte vorhanden.</p>
            <Button onClick={() => handleTemplateSelect('blank')}>
              <FiPlus size={16} />
              Erstes Dokument erstellen
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <p className="py-12 text-center text-grey-500 dark:text-grey-400">
            Keine Ergebnisse gefunden.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-md max-md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {filteredItems.map((item) => {
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
                    onClick={() => navigate(`/docs/presentation/${item.data.id}`)}
                  />
                );
              return (
                <BoardCard
                  key={`board-${item.data.id}`}
                  board={item.data}
                  onClick={() => navigate(`/boards/${item.data.id}`)}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Mobile FAB */}
      <div className="fixed bottom-5 right-5 z-[100] sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className="h-[52px] w-[52px] rounded-full shadow-lg"
              aria-label="Neu erstellen"
            >
              <FiPlus size={24} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={8}>
            {createMenuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

function DocumentCard({
  doc,
  adapter,
  onDelete,
  onRename,
  onShare,
}: {
  doc: {
    id: string;
    title: string;
    updated_at: string;
    document_subtype: string;
    content?: string;
    access_type?: string;
    creator_name?: string;
  };
  adapter: ReturnType<typeof useDocsAdapter>;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (doc: { id: string; title: string }, e: React.MouseEvent) => void;
  onShare: (doc: { id: string; title: string }) => void;
}) {
  const style = DOC_TYPE_STYLE[doc.document_subtype] || DOC_TYPE_STYLE.blank;
  const TypeIcon = style.icon;
  const hasContent = !!doc.content?.trim();

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200 bg-background',
        'aspect-[4/4.5] transition-[box-shadow,border-color,transform] duration-150',
        'hover:shadow-md hover:border-grey-300',
        'dark:border-grey-700 dark:hover:border-grey-500',
        'md:hover:-translate-y-0.5',
        'max-sm:aspect-[4/3]'
      )}
      onClick={() => adapter.navigateToDocument(doc.id)}
    >
      {hasContent ? (
        <div className="relative flex-1 overflow-hidden bg-grey-50 dark:bg-grey-800/50">
          <div
            className={cn(
              'pointer-events-none w-[800px] origin-top-left scale-[0.3] select-none px-12 py-8',
              'font-[PT_Sans,Arial,sans-serif] leading-relaxed text-foreground',
              '[&_h1]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-3 [&_h1]:mt-0',
              '[&_h2]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-3.5 [&_h2]:mb-1.5',
              '[&_h3]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1',
              '[&_p]:text-[0.8rem] [&_p]:mb-2 [&_p]:mt-0 [&_p]:leading-relaxed',
              '[&_ul]:text-[0.8rem] [&_ul]:mb-2 [&_ul]:pl-5 [&_ol]:text-[0.8rem] [&_ol]:mb-2 [&_ol]:pl-5',
              '[&_li]:mb-0.5',
              '[&_strong]:font-semibold',
              '[&_em]:italic'
            )}
            dangerouslySetInnerHTML={{ __html: doc.content! }}
          />
        </div>
      ) : (
        <div className={`flex flex-1 items-center justify-center pb-10 ${style.bg}`}>
          <TypeIcon size={32} className={style.text} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-semibold text-foreground">{doc.title}</h3>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-grey-500 dark:text-grey-400">
              <span>
                {new Date(doc.updated_at).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
              {doc.access_type && doc.access_type !== 'owner' && (
                <>
                  <span>·</span>
                  <span className="text-primary-600 dark:text-primary-400">
                    {doc.creator_name ? `Von ${doc.creator_name}` : 'Geteilt'}
                  </span>
                </>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                aria-label="Dokumentoptionen"
              >
                <FiMoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <DropdownMenuItem onClick={(e: React.MouseEvent) => onRename(doc, e)}>
                <FiEdit2 size={14} />
                Umbenennen
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onShare({ id: doc.id, title: doc.title });
                }}
              >
                <FiShare2 size={14} />
                Teilen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e: React.MouseEvent) => onDelete(doc.id, e)}
              >
                <FiTrash2 size={14} />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function PresentationCard({
  presentation,
  onClick,
}: {
  presentation: Presentation;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200 bg-background',
        'aspect-[4/4.5] transition-[box-shadow,border-color,transform] duration-150',
        'hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500',
        'dark:border-grey-700',
        'md:hover:-translate-y-0.5',
        'max-sm:aspect-[4/3]'
      )}
      onClick={onClick}
    >
      <div className="flex flex-1 items-center justify-center pb-10 bg-indigo-50 dark:bg-indigo-900/20">
        <FiMonitor size={32} className="text-indigo-500 dark:text-indigo-400" />
      </div>

      <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold text-foreground">{presentation.title}</h3>
          <div className="mt-0.5 text-[10px] text-grey-500 dark:text-grey-400">
            {new Date(presentation.updatedAt).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardCard({ board, onClick }: { board: Board; onClick: () => void }) {
  const isWhiteboard = getBoardType(board) === 'whiteboard';

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200 bg-background',
        'aspect-[4/4.5] transition-[box-shadow,border-color,transform] duration-150',
        'hover:shadow-md hover:border-secondary-300 dark:hover:border-secondary-500',
        'dark:border-grey-700',
        'md:hover:-translate-y-0.5',
        'max-sm:aspect-[4/3]'
      )}
      onClick={onClick}
    >
      <div className="flex flex-1 items-center justify-center pb-10 bg-secondary-50 dark:bg-secondary-900/20">
        {isWhiteboard ? (
          <PiPencilLine size={32} className="text-secondary-600 dark:text-secondary-400" />
        ) : (
          <PiKanban size={32} className="text-secondary-600 dark:text-secondary-400" />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold text-foreground">{board.title}</h3>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-grey-500 dark:text-grey-400">
            <span>
              {new Date(board.updated_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
            {board.creator_name && (
              <>
                <span>·</span>
                <span>{board.creator_name}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const DocsPage = () => (
  <ErrorBoundary>
    <PageContainer maxWidth="lg">
      <DocsProvider adapter={webAppDocsAdapter}>
        <SlidesProvider adapter={webAppSlidesAdapter}>
          <DocumentsContent />
        </SlidesProvider>
      </DocsProvider>
    </PageContainer>
  </ErrorBoundary>
);

const DocsPageFallback = () => (
  <PageContainer maxWidth="lg">
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
