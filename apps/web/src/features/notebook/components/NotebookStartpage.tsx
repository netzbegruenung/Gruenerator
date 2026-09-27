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
import { useState, type ReactNode } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { WorkplaceHero } from '../../workplace/components/WorkplaceHero';
import { LIVE_SEARCH_MIN_LENGTH } from '../manual-search/useLiveResearch';
import { NOTEBOOK_COMPOSER_ACCENT, NOTEBOOK_MAGENTA_BG } from '../notebookTheme';
import { NotebookOmniComposer } from '../omni/NotebookOmniComposer';

import { NotebookLiveSearch } from './NotebookLiveSearch';

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
  /** Scope of the live search under the composer. */
  recentCollectionIds: string[];
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

// Signature 2a gradient — pink radial (light) / deep-green radial (dark). Applied
// as the full-page background so the hero fills the surface like the other
// workplace pages instead of sitting in a bounded card. Defined in the leaf
// `notebookTheme` module; re-exported here for existing importers.
export { NOTEBOOK_MAGENTA_BG };

const HEADING = cn(
  'text-center text-[38px] font-extrabold leading-[1.1] tracking-[-0.02em]',
  'text-[#3A343B] dark:text-[#E4EDE8] max-md:text-3xl'
);

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
  showManualSearch = true,
  manualSearchNotebookId,
  omniComposer = false,
  pageGradient = true,
  footer,
}: NotebookStartpageProps) {
  const hasCollections = recentCollectionIds.length > 0;
  const manualSearchAvailable = showManualSearch && hasCollections;

  // Only the start page searches live, and only in the modes that ask for it.
  const composerText = useAuiState((s) => s.composer.text);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const liveSearch =
    manualSearchAvailable && answerMode !== undefined && composerModeRunsLiveSearch(answerMode);
  const hasHits = liveSearch && composerText.trim().length >= LIVE_SEARCH_MIN_LENGTH;
  // The composer moves up once the first answer is on screen, not with the
  // first keystroke, and stays up until the field is empty again — editing the
  // query never makes it bounce.
  const [raised, setRaised] = useState(false);
  const hasText = composerText.trim().length > 0;
  if (raised && (!hasText || !liveSearch)) setRaised(false);

  // --- Overview surface (/notebooks index + workplace "Wissen"): omni composer
  //     only. ---
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

  // --- Individual notebook page: one composer, live hits below it. Everything
  //     else about the notebook lives on its Übersicht tab. ---
  return (
    <PageContainer
      maxWidth="xl"
      noPadTop
      gradient={false}
      bgClassName={pageGradient ? 'relative isolate bg-white dark:bg-[#14090E]' : undefined}
    >
      {/* The gradient is its own layer so it can fade: gone while the composer
          is up (hits read better on a flat page), back once it is centred. */}
      {pageGradient && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500 ease-out motion-reduce:transition-none',
            NOTEBOOK_MAGENTA_BG,
            raised && 'opacity-0'
          )}
        />
      )}
      <div
        className={cn(
          'flex flex-col items-center px-6 transition-[padding] duration-500 ease-out motion-reduce:transition-none md:px-20',
          // The composer sits in the upper third; once hits come in it moves
          // up to give them the page.
          raised ? 'pt-10' : 'pt-[16vh] max-md:pt-[8vh]'
        )}
      >
        <h1 className={cn(HEADING, 'mb-8')}>{title}</h1>
        <div className={cn('w-full max-w-2xl', NOTEBOOK_COMPOSER_ACCENT)}>
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

      {/* Hits take the page's width (four to five columns on a wide screen). */}
      {liveSearch && (
        <div
          className={cn(
            'mx-auto w-full pb-10 pt-10',
            hasHits ? 'max-w-none' : 'max-w-3xl px-6 md:px-0'
          )}
        >
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
            onAnswered={() => setRaised(true)}
          />
        </div>
      )}

      {footer}
    </PageContainer>
  );
}
