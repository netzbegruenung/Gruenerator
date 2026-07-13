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
  /** Retained for API stability; no longer rendered in the 2a hero. */
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
  /** Render the omni composer (aggregate ask / route / open) in the KI hero
   *  instead of the plain notebook composer. */
  omniComposer?: boolean;
  /** Accepted for caller compatibility; the 2a hero card paints its own
   *  background, so the outer PageContainer gradient is always off. */
  pageGradient?: boolean;
  footer?: ReactNode;
}

type ViewMode = 'ki' | 'recherche' | 'globalChat';
type BrowseTab = 'zuletzt' | 'agenten' | 'stats';

// --- 2a gradient hero card ("Workplace pur") ---
// Exact light gradient per design; matching deep-green radial for dark mode.
const HERO_CARD = cn(
  'relative flex min-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-[18px]',
  'border border-[#E2E8E4] dark:border-[#243A30]',
  'shadow-[0_6px_22px_rgba(31,63,51,0.06)]',
  'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FAEBF3_0%,#FCF4F8_55%,#FEFDFE_100%)]',
  'dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#1E3A2E_0%,#16281F_55%,#0F1D17_100%)]'
);

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
const subActive =
  'bg-white dark:bg-[#1B2C24] border-[#52907A] text-[#316049] dark:text-[#7DB89E]';
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
  hideGlobalChat = false,
  manualSearchNotebookId,
  notebookMention,
  notebookId,
  omniComposer = false,
  footer,
}: NotebookStartpageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('ki');
  const [browseTab, setBrowseTab] = useState<BrowseTab>('zuletzt');
  // Seed query pushed from the omni composer's "Manuell recherchieren" path.
  const [manualSearchSeed, setManualSearchSeed] = useState({ query: '', nonce: 0 });

  const hasCollections = recentCollectionIds.length > 0;
  const manualSearchAvailable = showManualSearch && hasCollections;
  const globalChatAvailable = !!notebookMention && !hideGlobalChat;
  const anyExtraTabAvailable = manualSearchAvailable || globalChatAvailable;

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

  // Force-fall-through to 'ki' if the currently selected tab isn't available.
  let activeView: ViewMode = viewMode;
  if (activeView === 'recherche' && !manualSearchAvailable) activeView = 'ki';
  if (activeView === 'globalChat' && !globalChatAvailable) activeView = 'ki';

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
    enabled: manualSearchAvailable && activeView === 'recherche',
  });
  const docCount = stats?.totalDocuments;
  const rechercheHeading = docCount
    ? `Recherchiere in ${docCount.toLocaleString('de-DE')} Dokumenten`
    : 'Recherchiere in den Dokumenten';

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
    <PageContainer maxWidth="lg" noPadTop gradient={false}>
      <div className={HERO_CARD}>
        {/* Segmented tab control */}
        {anyExtraTabAvailable && (
          <div className="flex justify-center pt-6">
            <div className={SEG_CONTAINER}>
              <SegTab active={activeView === 'ki'} onClick={() => setViewMode('ki')}>
                KI
              </SegTab>
              {manualSearchAvailable && (
                <SegTab
                  active={activeView === 'recherche'}
                  onClick={() => setViewMode('recherche')}
                >
                  Manuelle Recherche
                </SegTab>
              )}
              {globalChatAvailable && (
                <SegTab
                  active={activeView === 'globalChat'}
                  onClick={() => setViewMode('globalChat')}
                >
                  Chat
                </SegTab>
              )}
            </div>
          </div>
        )}

        {activeView === 'ki' && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 md:px-20">
            <h1 className={cn(HEADING, 'mb-8')}>{title}</h1>
            <div className="w-full max-w-2xl">
              {omniComposer ? (
                <NotebookOmniComposer
                  onManualSearch={
                    manualSearchAvailable
                      ? (query) => {
                          setManualSearchSeed((prev) => ({ query, nonce: prev.nonce + 1 }));
                          setViewMode('recherche');
                        }
                      : undefined
                  }
                />
              ) : (
                <NotebookComposer
                  placeholder={placeholder}
                  sourceFilters={composerSourceFilters}
                  categoryFilters={composerCategoryFilters}
                  mode={mode}
                  onModeChange={onModeChange}
                />
              )}
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
                key={manualSearchSeed.nonce}
                collectionIds={recentCollectionIds}
                notebookId={manualSearchNotebookId}
                initialQuery={manualSearchSeed.query || undefined}
                browseSlot={browseSlot}
              />
            </div>
          </div>
        )}

        {activeView === 'globalChat' && notebookMention && (
          <div className="flex flex-1 flex-col justify-center px-6 py-10">
            <div className="mx-auto w-full max-w-3xl">
              <NotebookGlobalChatLauncher mention={notebookMention} />
            </div>
          </div>
        )}
      </div>

      {footer}
    </PageContainer>
  );
}
