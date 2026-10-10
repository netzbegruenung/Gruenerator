import { ThreadPrimitive, AuiIf } from '@assistant-ui/react';
import {
  AssistantMessage,
  CitationPanelProvider,
  CitationSidePanel,
  DEFAULT_NOTEBOOK_SOURCE_TIER,
  NotebookChatProvider,
  NotebookComposer,
  UserMessage,
  notebookComposerModeDef,
  toNotebookAnswerMode,
  notebookDepthDef,
  notebookMentionables,
  supportsSourceTier,
  useAgentStore,
  type CategoryFilterConfig,
  type CategoryFilterField,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import { type NotebookSourceTier } from '@gruenerator/contracts';
import { Skeleton, cn } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuthStore } from '../../../stores/authStore';
import { whenIdle } from '../../../utils/whenIdle';
import { buildChatHandoffUrl, createRepeatGuard, readChatHandoff } from '../chatHandoff';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import { getNotebookById } from '../config/notebooksConfig';
import { useNotebookChatBridge } from '../hooks/useNotebookChatBridge';
import { useNotebookCollection } from '../hooks/useNotebookCollection';
import { prefetchNotebookOverview } from '../hooks/useNotebookOverview';
import { NOTEBOOK_COMPOSER_ACCENT, NOTEBOOK_MAGENTA_BG } from '../notebookTheme';
import { loadNotebookOverview } from '../routeChunks';
import useNotebookStore from '../stores/notebookStore';

import { NotebookAccessError } from './NotebookAccessError';
import NotebookIndexingNotice, { resolveIndexingState } from './NotebookIndexingNotice';
import { NotebookStartpage } from './NotebookStartpage';
import { PendingQuestionSender } from './PendingQuestionSender';

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
  tag: string;
  text: string;
}

interface NotebookConfig {
  id: string;
  title: string;
  authTitle: string;
  collectionType: 'single' | 'multi';
  collections: NotebookCollection[];
  startPageTitle: string;
  placeholder: string;
  headerIcon: React.ComponentType<{ className?: string }>;
  exampleQuestions: ExampleQuestion[];
  documents?: Array<{ title: string; detail: string }>;
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
  /** Disable the example-question chip grid below the composer. Defaults to true. */
  showExamples?: boolean;
  /** Disable the manual research tab (dynamic user notebooks have no system collection scope). Defaults to true. */
  showManualSearch?: boolean;
  /**
   * Suppress the global-chat ("Chat") tab even when a notebook mention is available.
   * Used by aggregate surfaces (e.g. the /notebooks index) where the chat tab
   * doesn't correspond to a specific notebook the user picked. Defaults to false.
   */
  hideGlobalChat?: boolean;
  /**
   * When set, the manual research tab scopes to a single user-owned notebook
   * (ownership-checked, no facet filter UI). Scopes the start page's live search.
   */
  manualSearchNotebookId?: string;
  /** Replace the plain question composer with the omni composer (ask/route/
   *  open/research in one input). Used by the /notebooks index surface. */
  omniComposer?: boolean;
  /** Disable the startpage's own page background when embedded in a surface
   *  that paints its own (workplace "Wissen" tab tint). Defaults to true. */
  pageGradient?: boolean;
  /** A fixed Chat | Übersicht pill sits over the top row; keep the thread clear of it. */
  withTabBar?: boolean;
}

interface NotebookPageProps {
  configId: string;
}

/** The multi-select filters of a collection; date ranges are left out. */
function keywordFilters(raw: Record<string, unknown> | undefined): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(raw ?? {})) {
    if (Array.isArray(val)) filters[key] = val as string[];
  }
  return filters;
}

export const NotebookPageContent = ({
  config,
  documentIds,
  threadId: threadIdProp,
  startpageFooter,
  showExamples = true,
  showManualSearch = true,
  hideGlobalChat = false,
  manualSearchNotebookId,
  omniComposer = false,
  pageGradient = true,
  withTabBar = false,
}: NotebookPageContentProps): React.ReactElement => {
  const isMulti = config.collectionType === 'multi';
  const isSingleSystem = !isMulti && config.collections[0]?.id.endsWith('-system');
  const systemCollectionId = isSingleSystem ? config.collections[0].id : null;
  const locale = useAuthStore((state) => state.locale);
  // Die Reihe, die sich Unterhaltung und Quellenleser teilen — das Panel misst
  // sie, um zwischen Spalte und Sheet zu entscheiden.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { getFiltersForCollection, fetchFilterValues, setActiveFilter, clearAllFilters } =
    useNotebookStore();
  const filterValuesCache = useNotebookStore((s) => s.filterValuesCache);
  const activeFiltersStore = useNotebookStore((s) => s.activeFilters);
  // Persisted, unlike the source/category filters below: how much work an answer
  // is worth is a preference, and it used to reset to the narrowest tier on every
  // mount — including a plain page reload mid-conversation.
  const storedDepth = useAgentStore((s) => s.notebookDepth);
  const setMode = useAgentStore((s) => s.setNotebookDepth);
  const mode = notebookDepthDef(storedDepth).depth;
  // Quellen-Ampel: per notebook, remembered in the browser, offered only where the
  // collection knows demoted sources (parliament notebooks).
  const offersSourceTier = supportsSourceTier(config.collections.map((c) => c.id));
  const storedSourceTier = useAgentStore((s) => s.notebookSourceTiers[config.id]);
  const setStoredSourceTier = useAgentStore((s) => s.setNotebookSourceTier);
  const sourceTier = storedSourceTier ?? DEFAULT_NOTEBOOK_SOURCE_TIER;
  const setSourceTier = useCallback(
    (tier: NotebookSourceTier) => setStoredSourceTier(config.id, tier),
    [setStoredSourceTier, config.id]
  );
  const storedAnswerMode = useAgentStore((s) => s.notebookAnswerMode);
  const setAnswerMode = useAgentStore((s) => s.setNotebookAnswerMode);
  const answerMode = notebookComposerModeDef(storedAnswerMode).mode;
  const [searchParams, setSearchParams] = useSearchParams();
  // A question opened from another tab's start page, with the filters it was
  // asked under — read once, the sender clears the params after sending.
  const [handoff] = useState(() => readChatHandoff(searchParams));
  // `?thread=` names the conversation to open — that is how a thread row in the
  // sidebar links here, and how a reload finds its way back to what was on
  // screen. Read once: later edits to the param are this component's own doing.
  const [urlThreadId] = useState<string | null>(() => searchParams.get('thread'));
  const [threadId, setThreadId] = useState<string | null>(threadIdProp ?? urlThreadId);
  const handleThreadCreated = useCallback(
    (newThreadId: string) => {
      setThreadId(newThreadId);
      // Put the fresh conversation in the URL so reloading stays inside it.
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

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (!isMulti) return [];
    const all = localeCollections.map((c) => c.id);
    return handoff?.sourceIds ? all.filter((id) => handoff.sourceIds!.includes(id)) : all;
  });

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

  // Two ways to restore a conversation, and they must not both fire: the server
  // history behind `?thread=` is the complete one, the local cache only knows
  // what this browser saw. When the URL names a thread, the runtime loads it.
  const { initialMessages, onComplete } = useNotebookChatBridge({
    collections: selectedCollections,
    persistMessages: config.persistMessages,
    freshConversation,
    resumeFromCache: resumeFromCache && !urlThreadId,
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

  // Fresh tab, fresh store: the handed-over filters go in before the pending
  // question is sent (the sender waits a beat after mount).
  useEffect(() => {
    if (!systemCollectionId || !handoff) return;
    const current = useNotebookStore.getState().getFiltersForCollection(systemCollectionId);
    for (const [field, values] of Object.entries(handoff.filters)) {
      const active = current[field];
      for (const value of values) {
        if (!(Array.isArray(active) && active.includes(value))) {
          setActiveFilter(systemCollectionId, field, value);
        }
      }
    }
  }, [systemCollectionId, handoff, setActiveFilter]);

  const [isRepeatSubmit] = useState(() => createRepeatGuard());
  const openChatTab = useCallback(
    (question: string) => {
      if (isRepeatSubmit(question)) return;
      const url = buildChatHandoffUrl(location.pathname, {
        question,
        filters: systemCollectionId ? keywordFilters(activeFiltersStore[systemCollectionId]) : {},
        sourceIds: isMulti && selectedIds.length < localeCollections.length ? selectedIds : null,
      });
      window.open(url, '_blank', 'noopener');
    },
    [
      isRepeatSubmit,
      location.pathname,
      systemCollectionId,
      activeFiltersStore,
      isMulti,
      selectedIds,
      localeCollections.length,
    ]
  );

  // Fetch filter values for single system collections
  useEffect(() => {
    if (systemCollectionId) {
      void fetchFilterValues(systemCollectionId);
    }
  }, [systemCollectionId, fetchFilterValues]);

  // The Übersicht tab sits one click away on a tabbed system notebook — have
  // its chunk and data ready by the time that click comes.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!systemCollectionId || !withTabBar) return;
    return whenIdle(() => {
      void loadNotebookOverview().catch(() => {});
      void prefetchNotebookOverview(queryClient, systemCollectionId);
    });
  }, [systemCollectionId, withTabBar, queryClient]);

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
        ...(cfg.collapsed ? { collapsed: true } : {}),
      }));

    if (fields.length === 0) return undefined;

    const activeFilters = keywordFilters(activeFiltersStore[systemCollectionId]);

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
      {...(offersSourceTier ? { sourceTier } : {})}
      answerMode={toNotebookAnswerMode(answerMode)}
      magicSearch={answerMode === 'auto'}
      documentIds={documentIds}
      offerExplainable
    >
      <PendingQuestionSender />
      <CitationPanelProvider>
        {/* Der Quellenleser ist eine Geschwisterspalte, kein Overlay: ein Zitat
            nachzulesen heißt, es mit dem Satz zu vergleichen, der es benutzt. */}
        <div ref={surfaceRef} className="flex h-full min-h-0 w-full">
          <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            {/* `isLoading` guards the start page while a conversation named by
              `?thread=` is still being fetched — without it the start page
              flashes up first and reads as "this conversation is gone". */}
            <AuiIf condition={(s) => s.thread.isEmpty && !s.thread.isLoading}>
              <div className="flex flex-1 flex-col overflow-y-auto">
                <NotebookStartpage
                  title={config.startPageTitle}
                  placeholder={config.placeholder}
                  exampleQuestions={showExamples ? (config.exampleQuestions ?? []) : []}
                  composerSourceFilters={sourceFilters}
                  composerCategoryFilters={categoryFilters}
                  mode={mode}
                  onModeChange={setMode}
                  {...(offersSourceTier ? { sourceTier, onSourceTierChange: setSourceTier } : {})}
                  answerMode={answerMode}
                  onAnswerModeChange={setAnswerMode}
                  recentCollectionIds={recentCollectionIds}
                  showManualSearch={showManualSearch}
                  hideGlobalChat={hideGlobalChat}
                  manualSearchNotebookId={manualSearchNotebookId}
                  notebookMention={notebookMention}
                  omniComposer={omniComposer}
                  pageGradient={pageGradient}
                  footer={startpageFooter}
                  onOpenChat={openChatTab}
                />
              </div>
            </AuiIf>
            <AuiIf condition={(s) => s.thread.isEmpty && s.thread.isLoading}>
              <ThreadLoadingSkeleton withTabBar={withTabBar} />
            </AuiIf>
            <AuiIf condition={(s) => !s.thread.isEmpty}>
              <div className="flex min-h-0 h-full flex-col">
                <ThreadPrimitive.Viewport
                  className={cn('flex flex-1 flex-col overflow-y-auto px-4', withTabBar && 'pt-12')}
                >
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
                    <ThreadPrimitive.Messages
                      components={{
                        UserMessage,
                        AssistantMessage,
                      }}
                    />
                  </div>
                </ThreadPrimitive.Viewport>
                <div className={NOTEBOOK_COMPOSER_ACCENT}>
                  <NotebookComposer
                    placeholder={config.placeholder}
                    sourceFilters={sourceFilters}
                    categoryFilters={categoryFilters}
                    mode={mode}
                    onModeChange={setMode}
                    {...(offersSourceTier ? { sourceTier, onSourceTierChange: setSourceTier } : {})}
                    answerMode={answerMode}
                    onAnswerModeChange={setAnswerMode}
                    settingsClassName={NOTEBOOK_COMPOSER_ACCENT}
                  />
                </div>
              </div>
            </AuiIf>
          </ThreadPrimitive.Root>
          <CitationSidePanel containerRef={surfaceRef} />
        </div>
      </CitationPanelProvider>
    </NotebookChatProvider>
  );

  return <ErrorBoundary>{chatContent}</ErrorBoundary>;
};

/** The conversation named by `?thread=` is on its way: its shape, not a blank page. */
function ThreadLoadingSkeleton({ withTabBar }: { withTabBar: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Unterhaltung wird geladen"
      className={cn('flex flex-1 flex-col px-4', withTabBar && 'pt-12')}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
        <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

/**
 * The start page's frame while a notebook nobody has listed yet is fetched
 * (direct link, reload): heading and composer in place instead of a bare
 * loading line. The chat itself needs the collection's real id to run.
 */
function NotebookPageShell() {
  return (
    <PageContainer maxWidth="xl" noPadTop gradient={false} bgClassName={NOTEBOOK_MAGENTA_BG}>
      <div
        aria-busy="true"
        aria-label="Notebook wird geladen"
        className="flex flex-col items-center px-6 pt-[max(2.5rem,calc(50dvh-10rem))] max-md:pt-[8vh] md:px-20"
      >
        <Skeleton className="mb-8 h-10 w-72 max-w-full rounded-xl" />
        <Skeleton className="h-[120px] w-full max-w-2xl rounded-3xl" />
      </div>
    </PageContainer>
  );
}

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

  // Reset agent to the default (universal). NotebookPage warms a system
  // notebook's agent into the persisted store; without a counterpart here,
  // a stale öffentlichkeitsarbeit-* selection bleeds into user notebooks.
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);
  useEffect(() => {
    setSelectedAgent(null);
  }, [id, setSelectedAgent]);

  // Single-collection fetch gated by checkNotebookAccess — works for direct
  // URL access to a `share_mode='authenticated'` notebook regardless of the
  // viewer's locale (audience is a discovery-listing hint, not an access wall).
  // Usually the list the notebook was clicked from already holds it, and the
  // page renders from that entry while this request confirms access.
  const { data, isLoading, isPlaceholderData, refetch } = useNotebookCollection(id);
  const collection = data?.collection ?? null;
  const fetchError = data?.error ?? null;

  if (isLoading) return <NotebookPageShell />;

  if (!collection) {
    return <NotebookAccessError variant={fetchError ?? 'unknown'} onRetry={() => void refetch()} />;
  }

  const config: NotebookConfig = {
    id: collection.id,
    title: collection.name || 'Notebook',
    authTitle: 'Q&A Notebook',
    collectionType: 'single',
    collections: [{ id: collection.id, name: collection.name }],
    startPageTitle: collection.name || 'Notebook',
    placeholder: 'Stellen Sie eine Frage zu den Dokumenten...',
    headerIcon: () => null,
    exampleQuestions: [],
    persistMessages: true,
  };

  // A list entry may come from the login seed, which carries no indexing
  // state — wait for the real answer instead of guessing a banner.
  const indexingState = isPlaceholderData ? null : resolveIndexingState(collection);

  return (
    <>
      {/* The chat stays usable while indexing — it can already answer from the
          sources that finished, and blocking it would punish exactly the
          freshly created notebook this notice exists for. Saying nothing was
          the old behaviour: every question came back "nichts gefunden", which
          reads like a wrong answer instead of an unfinished import. */}
      <NotebookIndexingNotice state={indexingState} counts={collection.indexing_counts} />
      <NotebookPageContent
        config={config}
        showManualSearch
        manualSearchNotebookId={collection.id}
      />
    </>
  );
};

export const DynamicNotebook = withAuthRequired(DynamicNotebookPage, {
  title: 'Q&A Notebook',
});

export default NotebookPage;
