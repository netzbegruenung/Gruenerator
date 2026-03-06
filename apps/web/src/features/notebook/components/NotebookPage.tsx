import { ThreadPrimitive } from '@assistant-ui/react';
import {
  NotebookChatProvider,
  NotebookComposer,
  UserMessage,
  WelcomeScreen,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { CitationModal } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import { useNotebookChatBridge } from '../hooks/useNotebookChatBridge';
import useNotebookStore from '../stores/notebookStore';

import { NotebookAssistantMessage } from './NotebookAssistantMessage';

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
}

interface NotebookPageProps {
  configId: string;
}

const NotebookPageContent = ({ config }: NotebookPageContentProps): React.ReactElement => {
  const isMulti = config.collectionType === 'multi';
  const locale = useAuthStore((state) => state.locale);
  const { getFiltersForCollection } = useNotebookStore();
  const [mode, setMode] = useState<'fast' | 'deep'>('fast');
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

  return (
    <ErrorBoundary>
      <div className="flex items-center justify-center gap-sm border-b border-border bg-background-alt px-md py-sm text-sm text-foreground">
        <span>Diese Funktion befindet sich in der Beta-Phase. Antworten können ungenau sein.</span>
      </div>
      <CitationModal />
      <NotebookChatProvider
        collections={providerCollections}
        locale={locale}
        filters={filters}
        extraParams={extraParams}
        initialMessages={initialMessages}
        onComplete={onComplete as (metadata: NotebookMessageMetadata) => void}
        mode={mode}
      >
        <div className="notebook-page-root flex min-h-0 flex-col">
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
                    AssistantMessage: NotebookAssistantMessage,
                  }}
                />
              </div>
              <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-background">
                <NotebookComposer
                  placeholder={config.placeholder}
                  sourceFilters={sourceFilters}
                  mode={mode}
                  onModeChange={setMode}
                />
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </div>
      </NotebookChatProvider>
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
  } = useNotebookStore();
  const [collection, setCollection] = useState<NotebookCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCollection = async () => {
      if (!id) return;
      setLoading(true);
      let found = getQACollection(id);
      if (!found) {
        await fetchQACollections();
        found = getQACollection(id);
      }
      setCollection(found || null);
      setLoading(false);
    };
    if (id && user) void loadCollection();
  }, [id, getQACollection, fetchQACollections, user, qaCollections]);

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

  const config: NotebookConfig = {
    id: collection.id,
    title: collection.name || 'Notebook',
    authTitle: 'Q&A Notebook',
    collectionType: 'single',
    collections: [{ id: collection.id, name: collection.name, linkType: collection.linkType }],
    startPageTitle: `Fragen zu "${collection.name || 'Notebook'}"`,
    placeholder: 'Stellen Sie eine Frage zu den Dokumenten...',
    infoPanelDescription: `Durchsuche die Dokumente in "${collection.name}" mit KI-gestützten Fragen.`,
    headerIcon: () => null,
    exampleQuestions: [],
    persistMessages: true,
  };

  return <NotebookPageContent config={config} />;
};

export const DynamicNotebook = withAuthRequired(DynamicNotebookPage, {
  title: 'Q&A Notebook',
});

export default NotebookPage;
