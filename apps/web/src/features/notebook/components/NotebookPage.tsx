import { ThreadPrimitive } from '@assistant-ui/react';
import {
  AssistantMessage,
  CitationPanelProvider,
  CitationSidePanel,
  ExtraActionsProvider,
  NotebookChatProvider,
  NotebookComposer,
  UserMessage,
  WelcomeScreen,
  type CategoryFilterConfig,
  type CategoryFilterField,
  type ChatMessageMetadata,
  type ExtraAction,
  type NotebookMessageMetadata,
  MODEL_OPTIONS,
} from '@gruenerator/chat';
import { PanelLeft } from 'lucide-react';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { FaFileWord } from 'react-icons/fa';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { CitationModal } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import { useExportStore } from '../../../stores/core/exportStore';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import { useNotebookChatBridge } from '../hooks/useNotebookChatBridge';
import useNotebookStore from '../stores/notebookStore';

import { DocumentBrowserPanel } from './DocumentBrowserPanel';

import type { NotebookCollection as FullNotebookCollection } from '../../../types/notebook';

interface NotebookCollection {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
  documentCount?: string | number;
  externalUrl?: string;
  linkType?: string;
  locale?: string;
}

interface ExampleQuestion {
  icon: string;
  text: string;
}

interface NotebookSource {
  name?: string;
  count?: string;
  id?: string;
  selected?: boolean;
}

interface NotebookConfig {
  id: string;
  title: string;
  authTitle: string;
  collectionType: 'single' | 'multi';
  collections: NotebookCollection[];
  startPageTitle: string;
  placeholder: string;
  infoPanelDescription: string;
  headerIcon: React.ComponentType<{ className?: string }>;
  exampleQuestions: ExampleQuestion[];
  documents?: Array<{ title: string; detail: string }>;
  sources?: NotebookSource[];
  externalUrl?: string;
  persistMessages?: boolean;
  useSystemUserId?: boolean;
  systemUserId?: string;
}

interface NotebookPageContentProps {
  config: NotebookConfig;
  documentIds?: string[];
  threadId?: string | null;
}

interface NotebookPageProps {
  configId: string;
}

function useNotebookExtraActionsFactory(): (message: {
  text: string;
  metadata?: ChatMessageMetadata;
}) => ExtraAction[] {
  const generateNotebookDOCX = useExportStore((state) => state.generateNotebookDOCX);

  return useCallback(
    ({ text, metadata }) => {
      if (!metadata?.rawCitations?.length && !metadata?.citations?.length) return [];

      return [
        {
          id: 'notebook-docx',
          label: 'Word mit Quellen',
          icon: <FaFileWord className="h-4 w-4" />,
          onClick: () => {
            void generateNotebookDOCX(
              text,
              metadata.question || 'Notebook-Antwort',
              (metadata.rawCitations || []) as any,
              (metadata.sources || []) as any
            );
          },
        },
      ];
    },
    [generateNotebookDOCX]
  );
}

const NotebookPageContent = ({
  config,
  documentIds,
  threadId: threadIdProp,
}: NotebookPageContentProps): React.ReactElement => {
  const isMulti = config.collectionType === 'multi';
  const isSingleSystem = !isMulti && config.collections[0]?.id.endsWith('-system');
  const systemCollectionId = isSingleSystem ? config.collections[0].id : null;
  const locale = useAuthStore((state) => state.locale);
  const extraActionsFactory = useNotebookExtraActionsFactory();
  const { getFiltersForCollection, fetchFilterValues, setActiveFilter, clearAllFilters } =
    useNotebookStore();
  const filterValuesCache = useNotebookStore((s) => s.filterValuesCache);
  const activeFiltersStore = useNotebookStore((s) => s.activeFilters);
  const [mode, setMode] = useState<'fast' | 'deep'>('fast');
  const [selectedModelId, setSelectedModelId] = useState('mistral');
  const selectedModelOption =
    MODEL_OPTIONS.find((m) => m.id === selectedModelId) || MODEL_OPTIONS[0];
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    if (modelId === 'litellm') {
      setMode('fast');
    }
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [threadId, setThreadId] = useState<string | null>(
    threadIdProp || searchParams.get('thread')
  );
  const handleThreadCreated = useCallback(
    (newThreadId: string) => {
      setThreadId(newThreadId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('thread', newThreadId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const location = useLocation();
  const freshConversation = (location.state as { freshConversation?: boolean } | null)
    ?.freshConversation;

  const localeCollections = useMemo(() => {
    if (!isMulti) return config.collections;
    return config.collections.filter((c) => !c.locale || c.locale === locale);
  }, [isMulti, config.collections, locale]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    isMulti ? localeCollections.map((c) => c.id) : []
  );

  const selectedCollections = useMemo(() => {
    if (isMulti) {
      return localeCollections.filter((c) => selectedIds.includes(c.id));
    }
    return localeCollections;
  }, [isMulti, localeCollections, selectedIds]);

  const handleSourceToggle = useCallback((sourceId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(sourceId)) {
        return prev.filter((id) => id !== sourceId);
      }
      return [...prev, sourceId];
    });
  }, []);

  const extraParams = useMemo(() => {
    if (config.useSystemUserId && config.systemUserId) {
      return { search_user_id: config.systemUserId };
    }
    return {};
  }, [config.useSystemUserId, config.systemUserId]);

  const filters = useMemo(() => {
    if (isMulti) {
      const aggregated: Record<string, unknown> = {};
      selectedCollections.forEach((c) => {
        const f = getFiltersForCollection(c.id);
        if (Object.keys(f).length > 0) aggregated[c.id] = f;
      });
      return Object.keys(aggregated).length > 0 ? aggregated : undefined;
    }
    const f = getFiltersForCollection(selectedCollections[0]?.id);
    return Object.keys(f).length > 0 ? f : undefined;
  }, [isMulti, selectedCollections, getFiltersForCollection]);

  const { initialMessages, onComplete } = useNotebookChatBridge({
    collections: selectedCollections,
    persistMessages: config.persistMessages,
    freshConversation,
  });

  const providerCollections = useMemo(
    () => selectedCollections.map((c) => ({ id: c.id, name: c.name, linkType: c.linkType })),
    [selectedCollections]
  );

  const handleSelectAll = useCallback(
    () => setSelectedIds(localeCollections.map((c) => c.id)),
    [localeCollections]
  );
  const handleSelectNone = useCallback(() => setSelectedIds([]), []);

  const sourceFilters = useMemo(() => {
    if (!isMulti) return undefined;
    return {
      collections: localeCollections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        documentCount: c.documentCount,
      })),
      selectedIds,
      onToggle: handleSourceToggle,
      onSelectAll: handleSelectAll,
      onSelectNone: handleSelectNone,
    };
  }, [
    isMulti,
    localeCollections,
    selectedIds,
    handleSourceToggle,
    handleSelectAll,
    handleSelectNone,
  ]);

  // Fetch filter values for single system collections
  useEffect(() => {
    if (systemCollectionId) {
      void fetchFilterValues(systemCollectionId);
    }
  }, [systemCollectionId, fetchFilterValues]);

  const categoryFilters = useMemo((): CategoryFilterConfig | undefined => {
    if (!systemCollectionId) return undefined;
    const filterValues = filterValuesCache[systemCollectionId];
    if (!filterValues) return undefined;

    const fields: CategoryFilterField[] = Object.entries(filterValues)
      .filter(([, cfg]) => cfg.type === 'keyword' && cfg.values && cfg.values.length > 0)
      .map(([field, cfg]) => ({
        field,
        label: cfg.label || field,
        values: (cfg.values || []).map((v) =>
          typeof v === 'object' && 'value' in v
            ? { value: v.value, count: v.count }
            : { value: v as string }
        ),
      }));

    if (fields.length === 0) return undefined;

    const rawActive = activeFiltersStore[systemCollectionId] || {};
    const activeFilters: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(rawActive)) {
      if (Array.isArray(val)) {
        activeFilters[key] = val;
      }
    }

    return {
      fields,
      activeFilters,
      onToggle: (field: string, value: string) => setActiveFilter(systemCollectionId, field, value),
      onClearAll: () => clearAllFilters(systemCollectionId),
    };
  }, [systemCollectionId, filterValuesCache, activeFiltersStore, setActiveFilter, clearAllFilters]);

  const chatContent = (
    <NotebookChatProvider
      collections={providerCollections}
      locale={locale}
      filters={filters}
      extraParams={extraParams}
      initialMessages={initialMessages}
      onComplete={onComplete as (metadata: NotebookMessageMetadata) => void}
      onThreadCreated={handleThreadCreated}
      threadId={threadId}
      mode={mode}
      provider={selectedModelOption.provider}
      model={selectedModelOption.id}
      documentIds={documentIds}
    >
      <CitationPanelProvider>
        <ExtraActionsProvider factory={extraActionsFactory}>
          <div className="flex min-h-0 h-full flex-col">
            <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
              <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto px-4">
                <ThreadPrimitive.Empty>
                  <WelcomeScreen
                    title={config.startPageTitle}
                    description={config.infoPanelDescription}
                    questions={config.exampleQuestions?.map((q) => ({ text: q.text ?? '' }))}
                  />
                </ThreadPrimitive.Empty>
                <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 py-4">
                  <ThreadPrimitive.Messages
                    components={{
                      UserMessage,
                      AssistantMessage,
                    }}
                  />
                </div>
              </ThreadPrimitive.Viewport>
              <NotebookComposer
                placeholder={config.placeholder}
                sourceFilters={sourceFilters}
                categoryFilters={categoryFilters}
                mode={mode}
                onModeChange={setMode}
                selectedModel={selectedModelId}
                onModelChange={handleModelChange}
              />
            </ThreadPrimitive.Root>
          </div>
        </ExtraActionsProvider>
        <CitationSidePanel />
      </CitationPanelProvider>
    </NotebookChatProvider>
  );

  return (
    <ErrorBoundary>
      <CitationModal />
      {chatContent}
    </ErrorBoundary>
  );
};

const NotebookPage = ({ configId }: NotebookPageProps): React.ReactElement => {
  const config = getNotebookConfig(configId) as NotebookConfig;
  return <NotebookPageContent config={config} />;
};

export const createNotebookPage = (configId: string) => {
  const config = getNotebookConfig(configId) as NotebookConfig;
  const Page = () => <NotebookPageContent config={config} />;
  return withAuthRequired(Page, { title: config.authTitle });
};

const DynamicNotebookPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useOptimizedAuth();
  const {
    getQACollection,
    fetchQACollections,
    qaCollections,
    loading: storeLoading,
    initDocumentSelection,
    getSelectedDocumentIds,
  } = useNotebookStore();
  const [collection, setCollection] = useState<FullNotebookCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const loadCollection = async () => {
      if (!id) return;
      setLoading(true);
      let found = getQACollection(id);
      if (!found) {
        await fetchQACollections();
        found = getQACollection(id);
      }
      if (found) {
        const docIds = (found.documents || [])
          .filter((d) => d.status === 'completed')
          .map((d) => d.id);
        initDocumentSelection(found.id, docIds);
      }
      setCollection(found || null);
      setLoading(false);
    };
    if (id && user) void loadCollection();
  }, [id, getQACollection, fetchQACollections, user, qaCollections, initDocumentSelection]);

  const selectedDocumentIds = collection ? getSelectedDocumentIds(collection.id) : [];

  if (loading)
    return (
      <div className="flex flex-1 items-center justify-center p-md text-foreground-muted">
        <p>Notebook wird geladen...</p>
      </div>
    );

  if (!collection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-sm p-md text-foreground-muted">
        <p>Notebook nicht gefunden oder keine Berechtigung.</p>
        <p className="text-xs">
          Collection ID: {id} · User ID: {user?.id} · Store Loading: {storeLoading ? 'Yes' : 'No'} ·
          Collections: {qaCollections?.length || 0}
        </p>
      </div>
    );
  }

  const hasDocuments = (collection.documents || []).length > 0;

  const config: NotebookConfig = {
    id: collection.id,
    title: collection.name || 'Notebook',
    authTitle: 'Q&A Notebook',
    collectionType: 'single',
    collections: [{ id: collection.id, name: collection.name }],
    startPageTitle: `Fragen zu "${collection.name || 'Notebook'}"`,
    placeholder: 'Stellen Sie eine Frage zu den Dokumenten...',
    infoPanelDescription: `Durchsuche die Dokumente in "${collection.name}" mit KI-gestützten Fragen.`,
    headerIcon: () => null,
    exampleQuestions: [],
    persistMessages: true,
  };

  if (!hasDocuments) {
    return <NotebookPageContent config={config} />;
  }

  return (
    <div className="flex h-full min-h-0">
      {sidebarOpen && (
        <div className="hidden w-72 shrink-0 lg:block">
          <DocumentBrowserPanel collection={collection} />
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute left-2 top-2 z-10 hidden rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground lg:block"
          aria-label={sidebarOpen ? 'Dokumente ausblenden' : 'Dokumente einblenden'}
          title={sidebarOpen ? 'Dokumente ausblenden' : 'Dokumente einblenden'}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <NotebookPageContent
          config={config}
          documentIds={selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined}
        />
      </div>
    </div>
  );
};

export const DynamicNotebook = withAuthRequired(DynamicNotebookPage, {
  title: 'Q&A Notebook',
});

export default NotebookPage;
