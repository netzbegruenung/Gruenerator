import {
  NotebookComposer,
  type CategoryFilterConfig,
  type SourceFilterConfig,
} from '@gruenerator/chat';
import { cn } from '@gruenerator/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { HiOutlineChartBar, HiOutlineClock, HiOutlineSparkles } from 'react-icons/hi2';

import PageContainer from '../../../components/common/PageContainer';
import { useNotebookStats } from '../hooks/useNotebookStats';
import { NotebookOmniComposer } from '../omni/NotebookOmniComposer';

import { LastAddedSection } from './LastAddedSection';
import { NotebookAgentsSection, useNotebookHasAgents } from './NotebookAgentsSection';
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
  /** Retained for API stability; no longer rendered. */
  exampleQuestions?: ExampleQuestion[];
  composerSourceFilters?: SourceFilterConfig;
  composerCategoryFilters?: CategoryFilterConfig;
  mode: 'fast' | 'deep';
  onModeChange: (mode: 'fast' | 'deep') => void;
  recentCollectionIds: string[];
  showRecentSourceLabel?: boolean;
  showStats?: boolean;
  showLastAdded?: boolean;
  showManualSearch?: boolean;
  /** Accepted for caller compatibility; the notebook "Chat" tab was removed. */
  hideGlobalChat?: boolean;
  /**
   * When set, the manual-research tab scopes search to a single user-owned notebook
   * (ownership-checked, no facet filters). Forwarded to `NotebookManualSearch`.
   */
  manualSearchNotebookId?: string;
  /** Accepted for caller compatibility; the notebook "Chat" tab was removed. */
  notebookMention?: string | null;
  /** Canonical notebook id (e.g. 'brandenburg-notebook') used to surface the
   *  notebook's LV agents. The agents section self-hides when none match. */
  notebookId?: string;
  /**
   * Overview mode: render only the intelligent omni composer (ask/route/open in
   * one input) — no KI/Manuelle-Recherche tabs, no browse sub-tabs. Used by the
   * /notebooks index + workplace "Wissen" surface. Individual notebook pages keep
   * the 2a KI / Manuelle Recherche experience.
   */
  omniComposer?: boolean;
  footer?: ReactNode;
}

type ViewMode = 'ki' | 'recherche';
type BrowseTab = 'zuletzt' | 'agenten' | 'stats';

// Signature 2a gradient — pink radial (light) / deep-green radial (dark). Applied
// as the full-page background so the hero fills the surface like the other
// workplace pages instead of sitting in a bounded card.
export const NOTEBOOK_MAGENTA_BG = cn(
  'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FAEBF3_0%,#FCF4F8_55%,#FEFDFE_100%)]',
  'dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#1E3A2E_0%,#16281F_55%,#0F1D17_100%)]'
);

const HERO_FILL = 'relative flex min-h-[calc(100vh-11rem)] flex-col';

const SEG_CONTAINER = cn(
  'inline-flex gap-0.5 rounded-full p-1',
  'bg-white/75 dark:bg-[#14281F]/55',
  'shadow-[0_2px_10px_rgba(31,63,51,0.06)]'
);
const segBase = 'rounded-full px-5 py-1.5 text-[13.5px] transition-all cursor-pointer select-none';
const segActive = cn(
  'bg-white dark:bg-[#1B2C24] font-bold text-[#22382E] dark:text-[#E4EDE8]',
  'shadow-[0_1px_4px_rgba(31,63,51,0.08)]'
);
const segInactive = 'font-normal text-[#5C6B63] dark:text-[#9AA8A1]';

const HEADING = cn(
  'text-center text-[38px] font-extrabold leading-[1.1] tracking-[-0.02em]',
  'text-[#3A4A42] dark:text-[#E4EDE8] max-md:text-3xl'
);

const QUICK_LINK =
  'text-[13.5px] font-bold text-[#316049] dark:text-[#7DB89E] hover:underline cursor-pointer';

const subBase = cn(
  'inline-flex items-center gap-2 rounded-full px-[17px] py-[9px] text-[13.5px] font-semibold',
  'border transition-all cursor-pointer select-none'
);
const subActive = 'bg-white dark:bg-[#1B2C24] border-[#52907A] text-[#316049] dark:text-[#7DB89E]';
const subInactive = cn(
  'bg-white/90 dark:bg-white/5 border-[rgba(82,144,122,0.25)]',
  'text-[#22382E] dark:text-[#C0D8CB] hover:border-[#52907A]'
);

const BROWSE_TABS: { id: BrowseTab; label: string; Icon: typeof HiOutlineClock }[] = [
  { id: 'zuletzt', label: 'Zuletzt', Icon: HiOutlineClock },
  { id: 'agenten', label: 'Agenten', Icon: HiOutlineSparkles },
  { id: 'stats', label: 'Statistiken', Icon: HiOutlineChartBar },
];

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(segBase, active ? segActive : segInactive)}
    >
      {children}
    </button>
  );
}

export function NotebookStartpage({
  title,
  placeholder,
  composerSourceFilters,
  composerCategoryFilters,
  mode,
  onModeChange,
  recentCollectionIds,
  showRecentSourceLabel,
  showStats = true,
  showLastAdded = true,
  showManualSearch = true,
  manualSearchNotebookId,
  notebookId,
  omniComposer = false,
  footer,
}: NotebookStartpageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('ki');
  const [browseTab, setBrowseTab] = useState<BrowseTab>('zuletzt');

  const hasCollections = recentCollectionIds.length > 0;
  const manualSearchAvailable = showManualSearch && hasCollections;
  const hasAgents = useNotebookHasAgents(notebookId);
  const lastAddedAvailable = showLastAdded && hasCollections;
  const statsAvailable = showStats && hasCollections;

  // Which browse sub-tabs exist under Manuelle Recherche.
  const availableBrowseTabs = useMemo(
    () =>
      BROWSE_TABS.filter((t) =>
        t.id === 'zuletzt' ? lastAddedAvailable : t.id === 'agenten' ? hasAgents : statsAvailable
      ),
    [lastAddedAvailable, hasAgents, statsAvailable]
  );

  // Force-fall-through to 'ki' if Manuelle Recherche isn't available.
  const activeView: ViewMode =
    viewMode === 'recherche' && manualSearchAvailable ? 'recherche' : 'ki';

  const activeBrowseTab = availableBrowseTabs.some((t) => t.id === browseTab)
    ? browseTab
    : (availableBrowseTabs[0]?.id ?? 'zuletzt');

  const openRecherche = (tab: BrowseTab) => {
    setBrowseTab(tab);
    setViewMode('recherche');
  };

  // Total document count for the Manuelle-Recherche heading. Shares the
  // react-query cache with StatisticsSection, so no duplicate fetch.
  const { data: stats } = useNotebookStats({
    collectionIds: recentCollectionIds,
    enabled: !omniComposer && manualSearchAvailable && activeView === 'recherche',
  });
  const docCount = stats?.totalDocuments;
  const rechercheHeading = docCount
    ? `Recherchiere in ${docCount.toLocaleString('de-DE')} Dokumenten`
    : 'Recherchiere in den Dokumenten';

  // --- Overview surface (/notebooks index + workplace "Wissen"): omni composer
  //     only. No segmented tabs, no browse sub-tabs. ---
  if (omniComposer) {
    return (
      <PageContainer maxWidth="lg" noPadTop gradient={false} bgClassName={NOTEBOOK_MAGENTA_BG}>
        <div className="flex flex-col items-center px-6 pb-6 pt-10 md:px-20 md:pt-16">
          <h1 className={cn(HEADING, 'mb-8')}>{title}</h1>
          <div className="w-full max-w-3xl">
            <NotebookOmniComposer />
          </div>
        </div>
        {footer}
      </PageContainer>
    );
  }

  // --- Individual notebook page: 2a KI / Manuelle Recherche, full-bleed. ---
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
              <Icon className="size-[15px] text-[#316049] dark:text-[#7DB89E]" />
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
    <PageContainer maxWidth="lg" noPadTop gradient={false} bgClassName={NOTEBOOK_MAGENTA_BG}>
      <div className={HERO_FILL}>
        {/* Segmented tab control — only when Manuelle Recherche exists. */}
        {manualSearchAvailable && (
          <div className="flex justify-center pt-6">
            <div className={SEG_CONTAINER}>
              <SegTab active={activeView === 'ki'} onClick={() => setViewMode('ki')}>
                KI
              </SegTab>
              <SegTab active={activeView === 'recherche'} onClick={() => setViewMode('recherche')}>
                Manuelle Recherche
              </SegTab>
            </div>
          </div>
        )}

        {activeView === 'ki' && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 md:px-20">
            <h1 className={cn(HEADING, 'mb-8')}>{title}</h1>
            <div className="w-full max-w-2xl">
              <NotebookComposer
                placeholder={placeholder}
                sourceFilters={composerSourceFilters}
                categoryFilters={composerCategoryFilters}
                mode={mode}
                onModeChange={onModeChange}
              />
            </div>
            {manualSearchAvailable && (lastAddedAvailable || statsAvailable) && (
              <div className="mt-7 flex flex-col items-center gap-2.5">
                {lastAddedAvailable && (
                  <button
                    type="button"
                    className={QUICK_LINK}
                    onClick={() => openRecherche('zuletzt')}
                  >
                    Zuletzt hinzugefügt ansehen
                  </button>
                )}
                {statsAvailable && (
                  <button
                    type="button"
                    className={QUICK_LINK}
                    onClick={() => openRecherche('stats')}
                  >
                    Statistiken &amp; Themen
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeView === 'recherche' && (
          <div className="flex flex-1 flex-col px-6 py-10 md:px-16">
            <h1 className={cn(HEADING, 'mb-8')}>{rechercheHeading}</h1>
            <div className="mx-auto w-full max-w-3xl">
              <NotebookManualSearch
                collectionIds={recentCollectionIds}
                notebookId={manualSearchNotebookId}
                browseSlot={browseSlot}
              />
            </div>
          </div>
        )}
      </div>

      {footer}
    </PageContainer>
  );
}
