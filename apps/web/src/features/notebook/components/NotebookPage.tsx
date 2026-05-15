import { ThreadPrimitive } from '@assistant-ui/react';
import {
  AssistantMessage,
  CitationPanelProvider,
  CitationSidePanel,
  ExtraActionsProvider,
  NotebookChatProvider,
  NotebookComposer,
  UserMessage,
  notebookMentionables,
  useAgentStore,
  type CategoryFilterConfig,
  type CategoryFilterField,
  type ChatMessageMetadata,
  type ExtraAction,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import React, { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { FaFileWord } from 'react-icons/fa';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { CitationModal } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuthStore } from '../../../stores/authStore';
import { useExportStore } from '../../../stores/core/exportStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import { getNotebookById } from '../config/notebooksConfig';
import { useNotebookChatBridge } from '../hooks/useNotebookChatBridge';
import useNotebookStore from '../stores/notebookStore';

import { NotebookStartpage } from './NotebookStartpage';

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
  /** Additional content rendered below the startpage sections (e.g. a notebook gallery on the root page). */
  startpageFooter?: ReactNode;
  /** Disable the Statistiken section (e.g. for small dynamic user notebooks). Defaults to true. */
  showStats?: boolean;
  /** Disable the built-in "Zuletzt hinzugefügt" section (caller renders its own). Defaults to true. */
  showLastAdded?: boolean;
  /** Disable the example-question chip grid below the composer. Defaults to true. */
  showExamples?: boolean;
  /** Disable the manual research tab (dynamic user notebooks have no system collection scope). Defaults to true. */
  showManualSearch?: boolean;
  /** Hide filter UI on the manual research tab. For user notebooks: no facets. */
  hideManualSearchFilters?: boolean;
  /** Route manual research to a per-notebook endpoint instead of /research/search. */
  manualSearchEndpoint?: { type: 'notebook'; notebookId: string };
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
              metadata.rawCitations ?? [],
              metadata.sources ?? []
            );
          },
        },
      ];
    },
    [generateNotebookDOCX]
  );
}

export const NotebookPageContent = ({
  config,
  documentIds,
  threadId: threadIdProp,
  startpageFooter,
  showStats = true,
  showLastAdded = true,
  showExamples = true,
  showManualSearch = true,
  hideManualSearchFilters = false,
  manualSearchEndpoint,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [threadId, setThreadId] = useState<string | null>(threadIdProp ?? null);
  const handleThreadCreated = useCallback((newThreadId: string) => {
    setThreadId(newThreadId);
  }, []);

  // Strip a stale ?thread= query param once on mount: the chat is no longer
  // restored from the URL, so leaving the param around just confuses bookmarks.
  useEffect(() => {
    if (!searchParams.get('thread')) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('thread');
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const location = useLocation();
  const navState = location.state as {
    freshConversation?: boolean;
    resumeNotebookChat?: boolean;
  } | null;
  const freshConversation = navState?.freshConversation;
  const resumeFromCache = navState?.resumeNotebookChat ?? false;

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

  // Getter that reads filters directly from the Zustand store at call time,
  // bypassing React's render pipeline which can produce stale values
  const getFilters = useCallback((): Record<string, unknown> | undefined => {
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
    resumeFromCache,
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
        ...(cfg.valueLabels ? { valueLabels: cfg.valueLabels } : {}),
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

  const recentCollectionIds = useMemo(
    () => selectedCollections.map((c) => c.id),
    [selectedCollections]
  );

  // Mention slug for the global-chat tab. notebookMentionables uses
  // identifiers like "<configId>-notebook"; if a config has no matching entry
  // (e.g. some custom multi-source configs), the global-chat tab is hidden.
  const notebookMention = useMemo(() => {
    const entry = notebookMentionables.find((m) => m.identifier === `${config.id}-notebook`);
    return entry?.mention ?? null;
  }, [config.id]);

  const chatContent = (
    <NotebookChatProvider
      collections={providerCollections}
      locale={locale}
      getFilters={getFilters}
      extraParams={extraParams}
      initialMessages={initialMessages}
      onComplete={onComplete as (metadata: NotebookMessageMetadata) => void}
      onThreadCreated={handleThreadCreated}
      threadId={threadId}
      mode={mode}
      documentIds={documentIds}
    >
      <CitationPanelProvider>
        <ExtraActionsProvider factory={extraActionsFactory}>
          <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
            <ThreadPrimitive.Empty>
              <div className="flex flex-1 flex-col overflow-y-auto">
                <NotebookStartpage
                  title={config.startPageTitle}
                  subtitle={config.infoPanelDescription}
                  sources={config.sources}
                  placeholder={config.placeholder}
                  exampleQuestions={showExamples ? (config.exampleQuestions ?? []) : []}
                  composerSourceFilters={sourceFilters}
                  composerCategoryFilters={categoryFilters}
                  mode={mode}
                  onModeChange={setMode}
                  recentCollectionIds={recentCollectionIds}
                  showRecentSourceLabel={isMulti}
                  showStats={showStats}
                  showLastAdded={showLastAdded}
                  showManualSearch={showManualSearch}
                  hideManualSearchFilters={hideManualSearchFilters}
                  manualSearchEndpoint={manualSearchEndpoint}
                  notebookMention={notebookMention}
                  footer={startpageFooter}
                />
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.If empty={false}>
              <div className="flex min-h-0 h-full flex-col">
                <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto px-4">
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
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
                />
              </div>
            </ThreadPrimitive.If>
          </ThreadPrimitive.Root>
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
  // Pre-select the LV-tuned agent in the global chat store when entering an LV
  // notebook. Effect runs only when `configId` changes — does NOT override
  // manual agent picks made later inside the chat. Notebook chat itself runs
  // on NotebookChatProvider and is unaffected; this is a warm-up for users who
  // navigate from the notebook into /chat afterwards.
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);
  useEffect(() => {
    const entry = getNotebookById(configId);
    if (entry?.defaultAgent) {
      setSelectedAgent(entry.defaultAgent);
    }
  }, [configId, setSelectedAgent]);
  return <NotebookPageContent config={config} />;
};

export const createNotebookPage = (configId: string) => {
  const config = getNotebookConfig(configId) as NotebookConfig;
  const Page = () => <NotebookPageContent config={config} />;
  return withAuthRequired(Page, { title: config.authTitle });
};

interface DynamicNotebookPageProps {
  /**
   * Optional explicit collection id. When omitted, falls back to the
   * `:id` route param. The /notebooks/:idOrSlug route uses a different
   * param name and routes through NotebookResolver, which must pass the
   * resolved id in via this prop.
   */
  id?: string;
}

export const DynamicNotebookPage = ({ id: idProp }: DynamicNotebookPageProps = {}) => {
  const { id: idFromParams } = useParams<{ id: string }>();
  const id = idProp ?? idFromParams;
  const user = useAuthStore((s) => s.user);

  // Reset agent to the default (universal). NotebookPage warms a system
  // notebook's agent into the persisted store; without a counterpart here,
  // a stale öffentlichkeitsarbeit-* selection bleeds into user notebooks.
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);
  useEffect(() => {
    setSelectedAgent(null);
  }, [id, setSelectedAgent]);

  const { query, getQACollection } = useNotebookCollections({ isActive: true });
  const collection = id ? getQACollection(id) : undefined;
  const { isLoading, isError, data: qaCollections } = query;

  if (isLoading)
    return (
      <div className="flex flex-1 items-center justify-center p-md text-foreground-muted">
        <p>Notebook wird geladen...</p>
      </div>
    );

  if (isError || !collection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-sm p-md text-foreground-muted">
        <p>Notebook nicht gefunden oder keine Berechtigung.</p>
        <p className="text-xs">
          Collection ID: {id} · User ID: {user?.id} · Collections: {qaCollections?.length || 0}
        </p>
      </div>
    );
  }

  const config: NotebookConfig = {
    id: collection.id,
    title: collection.name || 'Notebook',
    authTitle: 'Q&A Notebook',
    collectionType: 'single',
    collections: [{ id: collection.id, name: collection.name }],
    startPageTitle: collection.name || 'Notebook',
    placeholder: 'Stellen Sie eine Frage zu den Dokumenten...',
    infoPanelDescription:
      collection.description ||
      `Durchsuche die Dokumente in "${collection.name}" mit KI-gestützten Fragen.`,
    headerIcon: () => null,
    exampleQuestions: [],
    persistMessages: true,
  };

  return (
    <NotebookPageContent
      config={config}
      showStats={false}
      showLastAdded={false}
      showManualSearch
      hideManualSearchFilters
      manualSearchEndpoint={{ type: 'notebook', notebookId: collection.id }}
    />
  );
};

export const DynamicNotebook = withAuthRequired(DynamicNotebookPage, {
  title: 'Q&A Notebook',
});

export default NotebookPage;
