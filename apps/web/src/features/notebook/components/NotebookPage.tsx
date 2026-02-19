import { ThreadPrimitive } from '@assistant-ui/react';
import {
  NotebookChatProvider,
  NotebookComposer,
  UserMessage,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import React, { useState, useCallback, useMemo } from 'react';

import { CitationModal } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useAuthStore } from '../../../stores/authStore';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import { useNotebookChatBridge } from '../hooks/useNotebookChatBridge';
import useNotebookStore from '../stores/notebookStore';

import { NotebookAssistantMessage } from './NotebookAssistantMessage';
import { NotebookStartPage } from './NotebookStartPage';

import '../../../assets/styles/features/notebook/notebook-chat.css';
import '../../../components/common/Chat/ChatStartPage.css';

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

const SourceToggles = ({
  collections,
  selectedIds,
  onToggle,
}: {
  collections: NotebookCollection[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) => (
  <div className="flex flex-wrap gap-2 px-4 py-2">
    {collections.map((c) => (
      <button
        key={c.id}
        type="button"
        onClick={() => onToggle(c.id)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          selectedIds.includes(c.id)
            ? 'bg-primary text-white'
            : 'bg-surface-secondary text-foreground-muted hover:bg-surface-tertiary'
        }`}
      >
        {c.name}
      </button>
    ))}
  </div>
);

const NotebookPageContent = ({ config }: NotebookPageContentProps): React.ReactElement => {
  const isMulti = config.collectionType === 'multi';
  const locale = useAuthStore((state) => state.locale);
  const { getFiltersForCollection } = useNotebookStore();

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
  });

  return (
    <ErrorBoundary>
      <div className="notebook-beta-warning">
        <span>Diese Funktion befindet sich in der Beta-Phase. Antworten können ungenau sein.</span>
      </div>
      <CitationModal />
      <NotebookChatProvider
        collections={selectedCollections.map((c) => ({
          id: c.id,
          name: c.name,
          linkType: c.linkType,
        }))}
        locale={locale}
        filters={filters}
        extraParams={extraParams}
        initialMessages={initialMessages}
        onComplete={onComplete as (metadata: NotebookMessageMetadata) => void}
      >
        <div className="qa-chat-container">
          {isMulti && (
            <SourceToggles
              collections={localeCollections}
              selectedIds={selectedIds}
              onToggle={handleSourceToggle}
            />
          )}
          <ThreadPrimitive.Root className="flex h-full flex-col">
            <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto">
              <ThreadPrimitive.Empty>
                <NotebookStartPage
                  title={config.startPageTitle}
                  exampleQuestions={config.exampleQuestions}
                />
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{
                  UserMessage,
                  AssistantMessage: NotebookAssistantMessage,
                }}
              />
            </ThreadPrimitive.Viewport>
            <NotebookComposer placeholder={config.placeholder} />
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

export default NotebookPage;
