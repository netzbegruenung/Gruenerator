import { ThreadPrimitive } from '@assistant-ui/react';
import {
  NotebookComposer,
  type CategoryFilterConfig,
  type SourceFilterConfig,
} from '@gruenerator/chat';
import { cn, pillActive, pillBase, pillInactive } from '@gruenerator/ui';
import { memo, useState, type ReactNode } from 'react';

import PageContainer from '../../../components/common/PageContainer';

import { LastAddedSection } from './LastAddedSection';
import { NotebookAgentsSection } from './NotebookAgentsSection';
import { NotebookGlobalChatLauncher } from './NotebookGlobalChatLauncher';
import { NotebookManualSearch } from './NotebookManualSearch';
import { StatisticsSection } from './StatisticsSection';

interface ExampleQuestion {
  icon: string;
  /** One-word label shown on the chip. */
  tag: string;
  /** Full question sent as the chat prompt when the chip is clicked. */
  text: string;
}

interface NotebookStartpageProps {
  title: string;
  placeholder: string;
  exampleQuestions: ExampleQuestion[];
  composerSourceFilters?: SourceFilterConfig;
  composerCategoryFilters?: CategoryFilterConfig;
  mode: 'fast' | 'deep';
  onModeChange: (mode: 'fast' | 'deep') => void;
  recentCollectionIds: string[];
  showRecentSourceLabel?: boolean;
  showStats?: boolean;
  showLastAdded?: boolean;
  showManualSearch?: boolean;
  /**
   * Suppresses the global-chat ("Chat") tab even when a `notebookMention` is set.
   * Used by aggregate surfaces (e.g. the /notebooks index) where routing into the
   * global chat doesn't correspond to a specific notebook the user picked.
   */
  hideGlobalChat?: boolean;
  /**
   * When set, the manual-research tab scopes search to a single user-owned notebook
   * (ownership-checked, no facet filters). Forwarded to `NotebookManualSearch`.
   */
  manualSearchNotebookId?: string;
  /** Mention slug for the global-chat tab (e.g. 'berlin'). Null hides the tab. */
  notebookMention?: string | null;
  /** Canonical notebook id (e.g. 'brandenburg-notebook') used to surface the
   *  notebook's LV agents. The agents section self-hides when none match. */
  notebookId?: string;
  footer?: ReactNode;
}

type ViewMode = 'ki' | 'recherche' | 'globalChat';

const chipClass = cn(
  'group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700',
  'rounded-md px-md py-sm text-left text-sm text-foreground-heading',
  'cursor-pointer transition-all duration-300 ease-out',
  'hover:-translate-y-0.5 hover:shadow-md'
);

const ExampleChip = memo(({ question }: { question: ExampleQuestion }) => (
  <ThreadPrimitive.Suggestion prompt={question.text} asChild>
    <button type="button" className={chipClass}>
      <span className="shrink-0 text-base" aria-hidden>
        {question.icon}
      </span>
      <span className="truncate">{question.tag}</span>
    </button>
  </ThreadPrimitive.Suggestion>
));
ExampleChip.displayName = 'ExampleChip';

export function NotebookStartpage({
  title,
  placeholder,
  exampleQuestions,
  composerSourceFilters,
  composerCategoryFilters,
  mode,
  onModeChange,
  recentCollectionIds,
  showRecentSourceLabel,
  showStats = true,
  showLastAdded = true,
  showManualSearch = true,
  hideGlobalChat = false,
  manualSearchNotebookId,
  notebookMention,
  notebookId,
  footer,
}: NotebookStartpageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('ki');
  const manualSearchAvailable = showManualSearch && recentCollectionIds.length > 0;
  const globalChatAvailable = !!notebookMention && !hideGlobalChat;
  const anyExtraTabAvailable = manualSearchAvailable || globalChatAvailable;

  // Force-fall-through to 'ki' if the currently selected tab isn't available
  // (e.g. parent toggled off manual search after a state flip).
  let activeView: ViewMode = viewMode;
  if (activeView === 'recherche' && !manualSearchAvailable) activeView = 'ki';
  if (activeView === 'globalChat' && !globalChatAvailable) activeView = 'ki';

  return (
    <PageContainer maxWidth="lg">
      <div className="mb-lg pt-md text-center">
        <h1 className="mb-xs text-4xl font-semibold text-foreground-heading max-md:text-2xl">
          {title}
        </h1>
      </div>

      {anyExtraTabAvailable && (
        <div className="mb-lg flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('ki')}
            className={cn(pillBase, activeView === 'ki' ? pillActive : pillInactive)}
            aria-pressed={activeView === 'ki'}
          >
            KI
          </button>
          {manualSearchAvailable && (
            <button
              type="button"
              onClick={() => setViewMode('recherche')}
              className={cn(pillBase, activeView === 'recherche' ? pillActive : pillInactive)}
              aria-pressed={activeView === 'recherche'}
            >
              Manuelle Recherche
            </button>
          )}
          {globalChatAvailable && (
            <button
              type="button"
              onClick={() => setViewMode('globalChat')}
              className={cn(pillBase, activeView === 'globalChat' ? pillActive : pillInactive)}
              aria-pressed={activeView === 'globalChat'}
            >
              Chat
            </button>
          )}
        </div>
      )}

      {activeView === 'ki' && (
        <>
          <div className="mx-auto mb-xl max-w-3xl">
            <NotebookComposer
              placeholder={placeholder}
              sourceFilters={composerSourceFilters}
              categoryFilters={composerCategoryFilters}
              mode={mode}
              onModeChange={onModeChange}
            />
            {exampleQuestions.length > 0 && (
              <div className="mt-md grid grid-cols-1 gap-sm md:grid-cols-3">
                {exampleQuestions.map((q) => (
                  <ExampleChip key={q.text} question={q} />
                ))}
              </div>
            )}
          </div>

          {showLastAdded && recentCollectionIds.length > 0 && (
            <LastAddedSection
              collectionIds={recentCollectionIds}
              showSourceLabel={showRecentSourceLabel}
            />
          )}

          {notebookId && <NotebookAgentsSection notebookId={notebookId} />}

          {showStats && recentCollectionIds.length > 0 && (
            <StatisticsSection collectionIds={recentCollectionIds} />
          )}
        </>
      )}

      {activeView === 'recherche' && (
        <div className="mx-auto max-w-3xl">
          <NotebookManualSearch
            collectionIds={recentCollectionIds}
            notebookId={manualSearchNotebookId}
          />
        </div>
      )}

      {activeView === 'globalChat' && notebookMention && (
        <div className="mx-auto max-w-3xl">
          <NotebookGlobalChatLauncher mention={notebookMention} />
        </div>
      )}

      {footer}
    </PageContainer>
  );
}
