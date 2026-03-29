import {
  DocsProvider,
  useDocumentStore,
  useDocsAdapter,
  createDocsApiClient,
  templates,
  type TemplateType,
} from '@gruenerator/docs';
import {
  SlidesProvider,
  useSlidesAdapter,
  createSlidesApiClient,
  type GeneratePresentationResponse,
} from '@gruenerator/slides';
import {
  AIPromptInput,
  Button,
  Card,
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
  FiEdit2,
  FiFile,
  FiGrid,
  FiMoreVertical,
  FiPlus,
  FiSearch,
  FiShare2,
  FiTrash2,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';

import { webAppDocsAdapter } from './docsAdapter';
import { webAppSlidesAdapter } from './slidesAdapter';

const LazyPresentationsTab = lazy(() =>
  import('./DocsPresentationsTab').then((m) => ({ default: m.DocsPresentationsTab }))
);
const LazyShareModal = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.ShareModal }))
);
const LazyTemplatePicker = lazy(() =>
  import('@gruenerator/docs').then((m) => ({ default: m.TemplatePicker }))
);
type ContentTab = 'documents' | 'presentations';

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

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.trim() || '';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

function DocumentsContent() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const navigate = useNavigate();

  const documents = useDocumentStore((s) => s.documents);
  const isLoading = useDocumentStore((s) => s.isLoading);
  const error = useDocumentStore((s) => s.error);
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);
  const createDocument = useDocumentStore((s) => s.createDocument);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [activeTab, setActiveTab] = useState<ContentTab>('documents');
  const [showGallery, setShowGallery] = useState(false);
  const [showGenerateSlides, setShowGenerateSlides] = useState(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);

  const filteredDocuments = useMemo(() => {
    if (!deferredSearch.trim()) return documents;
    const query = deferredSearch.trim().toLowerCase();
    return documents.filter((doc) => doc.title.toLowerCase().includes(query));
  }, [documents, deferredSearch]);

  useEffect(() => {
    fetchDocuments(apiClient);
  }, [fetchDocuments, apiClient]);

  const handleTemplateSelect = useCallback(
    async (templateType: TemplateType) => {
      setShowGallery(false);
      try {
        const template = templates.find((t) => t.id === templateType);
        const title = template?.defaultTitle || 'Neues Dokument';
        const newDoc = await createDocument(apiClient, title, null, templateType);
        adapter.navigateToDocument(newDoc.id);
      } catch (err) {
        console.error('Failed to create document:', err);
      }
    },
    [createDocument, apiClient, adapter]
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Dokument wirklich löschen?')) {
      try {
        await deleteDocument(apiClient, id);
      } catch (err) {
        console.error('Failed to delete document:', err);
      }
    }
  };

  const handleRename = async (doc: { id: string; title: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = window.prompt('Neuer Titel:', doc.title);
    if (newTitle?.trim() && newTitle.trim() !== doc.title) {
      try {
        await updateDocument(apiClient, doc.id, { title: newTitle.trim() });
      } catch (err) {
        console.error('Failed to rename document:', err);
      }
    }
  };

  if (showGenerateSlides) {
    return (
      <SlidesProvider adapter={webAppSlidesAdapter}>
        <GenerateSlidesForm
          onBack={() => setShowGenerateSlides(false)}
          onGenerated={(id) => {
            setShowGenerateSlides(false);
            navigate(`/docs/presentation/${id}`);
          }}
        />
      </SlidesProvider>
    );
  }

  return (
    <>
      <div className="mb-md">
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
                placeholder={
                  activeTab === 'documents'
                    ? 'Dokumente durchsuchen…'
                    : 'Präsentationen durchsuchen…'
                }
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
                  Neues Dokument
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Dokument</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleTemplateSelect('blank')}>
                  <FiFile size={16} />
                  Leeres Dokument
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowGallery(true)}>
                  <FiGrid size={16} />
                  Aus Vorlage…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Präsentation</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setShowGenerateSlides(true)}>
                  <FiZap size={16} />
                  KI-Präsentation erstellen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex gap-1 border-b border-grey-200 dark:border-grey-700">
          <button
            onClick={() => setActiveTab('documents')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px bg-transparent',
              activeTab === 'documents'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-grey-500 hover:text-grey-700 dark:hover:text-grey-300'
            )}
          >
            Dokumente
          </button>
          <button
            onClick={() => setActiveTab('presentations')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px bg-transparent',
              activeTab === 'presentations'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-grey-500 hover:text-grey-700 dark:hover:text-grey-300'
            )}
          >
            Präsentationen
          </button>
        </div>
      </div>

      {activeTab === 'documents' && (
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
          ) : error ? (
            <p className="py-12 text-center text-red-600 dark:text-red-400">{error}</p>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-grey-500 dark:text-grey-400">
              <FiFile size={40} className="text-grey-300 dark:text-grey-600" />
              <p className="text-[0.9375rem]">Noch keine Dokumente vorhanden.</p>
              <Button onClick={() => handleTemplateSelect('blank')}>
                <FiPlus size={16} />
                Erstes Dokument erstellen
              </Button>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <p className="py-12 text-center text-grey-500 dark:text-grey-400">
              Keine Dokumente gefunden.
            </p>
          ) : (
            <CardGrid columns="auto" gap="md">
              {filteredDocuments.map((doc) => {
                const template = templates.find((t) => t.id === doc.document_subtype);
                const emoji = template?.icon || '📄';
                const excerpt = doc.content ? truncate(stripHtml(doc.content), 120) : '';

                return (
                  <Card
                    key={doc.id}
                    className="group cursor-pointer gap-0 py-0 transition-[box-shadow,border-color,transform] duration-150 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-500 md:hover:-translate-y-0.5"
                    onClick={() => adapter.navigateToDocument(doc.id)}
                  >
                    <div className="flex items-start gap-3 p-4 pb-2">
                      <span className="shrink-0 text-2xl leading-none mt-0.5">{emoji}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {doc.title}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-grey-500 dark:text-grey-400">
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
                        <DropdownMenuContent
                          align="end"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <DropdownMenuItem onClick={(e: React.MouseEvent) => handleRename(doc, e)}>
                            <FiEdit2 size={14} />
                            Umbenennen
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              setShareDoc({ id: doc.id, title: doc.title });
                            }}
                          >
                            <FiShare2 size={14} />
                            Teilen
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e: React.MouseEvent) => handleDelete(doc.id, e)}
                          >
                            <FiTrash2 size={14} />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {excerpt && (
                      <p className="px-4 pb-4 pt-0 text-xs leading-relaxed text-grey-500 dark:text-grey-400 line-clamp-2">
                        {excerpt}
                      </p>
                    )}
                  </Card>
                );
              })}
            </CardGrid>
          )}
        </main>
      )}

      {activeTab === 'presentations' && (
        <Suspense fallback={<div className="py-xl text-center text-grey-400">Lädt…</div>}>
          <LazyPresentationsTab
            searchQuery={deferredSearch}
            onPresentationClick={(id: string) => navigate(`/docs/presentation/${id}`)}
          />
        </Suspense>
      )}

      {/* Mobile FAB */}
      <div className="fixed bottom-5 right-5 z-[100] sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className="h-[52px] w-[52px] rounded-full shadow-lg"
              aria-label="Neues Dokument erstellen"
            >
              <FiPlus size={24} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={8}>
            <DropdownMenuLabel>Dokument</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleTemplateSelect('blank')}>
              <FiFile size={16} />
              Leeres Dokument
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowGallery(true)}>
              <FiGrid size={16} />
              Aus Vorlage…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Präsentation</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setShowGenerateSlides(true)}>
              <FiZap size={16} />
              KI-Präsentation erstellen
            </DropdownMenuItem>
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
    </>
  );
}

const DocsPage = () => (
  <ErrorBoundary>
    <PageContainer maxWidth="lg">
      <DocsProvider adapter={webAppDocsAdapter}>
        <DocumentsContent />
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
