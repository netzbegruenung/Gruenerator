import { useAuiState } from '@assistant-ui/react';
import {
  composerModeRunsLiveSearch,
  NotebookComposer,
  type CategoryFilterConfig,
  type NotebookComposerMode,
  type SourceFilterConfig,
} from '@gruenerator/chat';
import { type NotebookDepth } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { HiOutlineChartBar, HiOutlineClock, HiOutlineSparkles } from 'react-icons/hi2';

import PageContainer from '../../../components/common/PageContainer';
import { WorkplaceHero } from '../../workplace/components/WorkplaceHero';
import { LIVE_SEARCH_MIN_LENGTH } from '../manual-search/useLiveResearch';
import { NOTEBOOK_MAGENTA_BG } from '../notebookTheme';
import { NotebookOmniComposer } from '../omni/NotebookOmniComposer';

import { LastAddedSection } from './LastAddedSection';
import { NotebookAgentsSection, useNotebookHasAgents } from './NotebookAgentsSection';
import { NotebookLiveSearch } from './NotebookLiveSearch';
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
  /** Retained for API stability; no longer rendered. */
  exampleQuestions?: ExampleQuestion[];
  composerSourceFilters?: SourceFilterConfig;
  composerCategoryFilters?: CategoryFilterConfig;
  mode: NotebookDepth;
  onModeChange: (mode: NotebookDepth) => void;
  answerMode?: NotebookComposerMode;
  onAnswerModeChange?: (mode: NotebookComposerMode) => void;
  recentCollectionIds: string[];
  showRecentSourceLabel?: boolean;
  showStats?: boolean;
  showLastAdded?: boolean;
  showManualSearch?: boolean;
  /** Accepted for caller compatibility; the notebook "Chat" tab was removed. */
  hideGlobalChat?: boolean;
  /**
   * When set, the live search is scoped to a single user-owned notebook
   * (ownership-checked, no facet filters).
   */
  manualSearchNotebookId?: string;
  /** Accepted for caller compatibility; the notebook "Chat" tab was removed. */
  notebookMention?: string | null;
  /** Canonical notebook id (e.g. 'brandenburg-notebook') used to surface the
   *  notebook's LV agents. The agents section self-hides when none match. */
  notebookId?: string;
  /**
   * Overview mode: render only the intelligent omni composer (ask/route/open in
   * one input) — no live search, no browse sub-tabs. Used by the /notebooks
   * index + workplace "Wissen" surface.
   */
  omniComposer?: boolean;
  /** Paint the signature magenta gradient as the page background. Disabled when
   *  embedded in a surface that paints its own tint (workplace "Wissen" tab).
   *  Defaults to true. */
  pageGradient?: boolean;
  footer?: ReactNode;
}

type BrowseTab = 'zuletzt' | 'agenten' | 'stats';

// Signature 2a gradient — pink radial (light) / deep-green radial (dark). Applied
// as the full-page background so the hero fills the surface like the other
// workplace pages instead of sitting in a bounded card. Defined in the leaf
// `notebookTheme` module; re-exported here for existing importers.
export { NOTEBOOK_MAGENTA_BG };

const HERO_FILL = 'relative flex min-h-[calc(100dvh-11rem)] flex-col';

const HEADING = cn(
  'text-center text-[38px] font-extrabold leading-[1.1] tracking-[-0.02em]',
  'text-[#3A343B] dark:text-[#E4EDE8] max-md:text-3xl'
);

const subBase = cn(
  'inline-flex items-center gap-2 rounded-full px-[17px] py-[9px] text-[13.5px] font-semibold',
  'border transition-all cursor-pointer select-none'
);
const subActive =
  'bg-white dark:bg-[#2A1B23] border-[#9E93A0] dark:border-[#5A4B57] text-[#4A444C] dark:text-[#C9C2CB]';
const subInactive = cn(
  'bg-white/90 dark:bg-white/5 border-[rgba(90,75,87,0.25)]',
  'text-[#4A444C] dark:text-[#C9C2CB] hover:border-[#9E93A0]'
);

const BROWSE_TABS: { id: BrowseTab; label: string; Icon: typeof HiOutlineClock }[] = [
  { id: 'zuletzt', label: 'Zuletzt', Icon: HiOutlineClock },
  { id: 'agenten', label: 'Agents', Icon: HiOutlineSparkles },
  { id: 'stats', label: 'Statistiken', Icon: HiOutlineChartBar },
];

export function NotebookStartpage({
  title,
  placeholder,
  composerSourceFilters,
  composerCategoryFilters,
  mode,
  onModeChange,
  answerMode,
  onAnswerModeChange,
  recentCollectionIds,
  showRecentSourceLabel,
  showStats = true,
  showLastAdded = true,
  showManualSearch = true,
  manualSearchNotebookId,
  notebookId,
  omniComposer = false,
  pageGradient = true,
  footer,
}: NotebookStartpageProps) {
  const [browseTab, setBrowseTab] = useState<BrowseTab>('zuletzt');

  const hasCollections = recentCollectionIds.length > 0;
  const manualSearchAvailable = showManualSearch && hasCollections;
  const hasAgents = useNotebookHasAgents(notebookId);
  const lastAddedAvailable = showLastAdded && hasCollections;
  const statsAvailable = showStats && hasCollections;

  // Which browse sub-tabs exist below the composer.
  const availableBrowseTabs = useMemo(
    () =>
      BROWSE_TABS.filter((t) =>
        t.id === 'zuletzt' ? lastAddedAvailable : t.id === 'agenten' ? hasAgents : statsAvailable
      ),
    [lastAddedAvailable, hasAgents, statsAvailable]
  );

  const activeBrowseTab = availableBrowseTabs.some((t) => t.id === browseTab)
    ? browseTab
    : (availableBrowseTabs[0]?.id ?? 'zuletzt');

  // Only the start page searches live, and only in the modes that ask for it.
  const composerText = useAuiState((s) => s.composer.text);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const liveSearch =
    manualSearchAvailable && answerMode !== undefined && composerModeRunsLiveSearch(answerMode);
  const hasHits = liveSearch && composerText.trim().length >= LIVE_SEARCH_MIN_LENGTH;

  // --- Overview surface (/notebooks index + workplace "Wissen"): omni composer
  //     only. No segmented tabs, no browse sub-tabs. ---
  if (omniComposer) {
    return (
      <PageContainer
        maxWidth="lg"
        noPadTop
        gradient={false}
        bgClassName={pageGradient ? NOTEBOOK_MAGENTA_BG : undefined}
      >
        <WorkplaceHero title={title}>
          <NotebookOmniComposer />
        </WorkplaceHero>
        {footer}
      </PageContainer>
    );
  }

  // --- Individual notebook page: one composer; hits (or the browse sub-tabs)
  //     below it. ---
  const browseSlot =
    availableBrowseTabs.length > 0 ? (
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap justify-center gap-2.5">
          {availableBrowseTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBrowseTab(id)}
              aria-pressed={activeBrowseTab === id}
              className={cn(subBase, activeBrowseTab === id ? subActive : subInactive)}
            >
              <Icon className="size-[15px] text-[#4A444C] dark:text-[#C9C2CB]" />
              {label}
            </button>
          ))}
        </div>

        {activeBrowseTab === 'zuletzt' && lastAddedAvailable && (
          <LastAddedSection
            embedded
            collectionIds={recentCollectionIds}
            showSourceLabel={showRecentSourceLabel}
          />
        )}
        {activeBrowseTab === 'agenten' && notebookId && (
          <NotebookAgentsSection embedded notebookId={notebookId} />
        )}
        {activeBrowseTab === 'stats' && statsAvailable && (
          <StatisticsSection embedded collectionIds={recentCollectionIds} />
        )}
      </div>
    ) : undefined;

  return (
    <PageContainer
      maxWidth="lg"
      noPadTop
      gradient={false}
      bgClassName={pageGradient ? NOTEBOOK_MAGENTA_BG : undefined}
    >
      <div
        className={cn(
          'flex flex-col items-center px-6 pt-10 transition-[min-height] duration-300 md:px-20',
          hasHits ? 'min-h-0' : cn(HERO_FILL, 'justify-center')
        )}
      >
        <h1 className={cn(HEADING, 'mb-8')}>{title}</h1>
        <div className="w-full max-w-2xl">
          <NotebookComposer
            placeholder={placeholder}
            sourceFilters={composerSourceFilters}
            categoryFilters={composerCategoryFilters}
            mode={mode}
            onModeChange={onModeChange}
            answerMode={answerMode}
            onAnswerModeChange={onAnswerModeChange}
            {...(manualSearchAvailable ? { onManualSubmit: setSubmitted } : {})}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 pb-10 pt-8 md:px-0">
        {liveSearch ? (
          <NotebookLiveSearch
            text={composerText}
            submitted={submitted}
            collectionIds={recentCollectionIds}
            {...(manualSearchNotebookId ? { notebookId: manualSearchNotebookId } : {})}
            {...(composerCategoryFilters ? { sharedFilters: composerCategoryFilters } : {})}
            emptyHint={
              answerMode === 'manuell'
                ? 'Keine Treffer. Versuche andere Begriffe oder entferne Filter.'
                : 'Keine Treffer in den Quellen. Mit Enter fragst du die KI.'
            }
            idle={browseSlot}
          />
        ) : (
          browseSlot
        )}
      </div>

      {footer}
    </PageContainer>
  );
}
