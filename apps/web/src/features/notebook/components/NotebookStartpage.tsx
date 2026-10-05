import { useAui, useAuiState } from '@assistant-ui/react';
import {
  composerModeRunsLiveSearch,
  detectMagicIntent,
  NotebookComposer,
  type CategoryFilterConfig,
  type MagicIntent,
  type NotebookComposerMode,
  type SourceFilterConfig,
} from '@gruenerator/chat';
import { type NotebookDepth } from '@gruenerator/contracts';
import { LIVE_SEARCH_MIN_LENGTH } from '@gruenerator/shared/api';
import { cn } from '@gruenerator/ui';
import { useEffect, useState, type ReactNode } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { WorkplaceHero } from '../../workplace/components/WorkplaceHero';
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
  /** Opens a chat question in its own browser tab, so this page keeps the
   *  query and its hits. Without it the question is asked here. */
  onOpenChat?: (question: string) => void;
}

// Signature 2a gradient — pink radial (light) / deep-green radial (dark). Applied
// as the full-page background so the hero fills the surface like the other
// workplace pages instead of sitting in a bounded card. Defined in the leaf
// `notebookTheme` module; re-exported here for existing importers.
export { NOTEBOOK_MAGENTA_BG };

// Nobody has touched the page for this long: the hits fade out, then the
// composer settles back into the centre under the gradient.
export const IDLE_RETURN_MS = 60_000;
const FADE_MS = 500;
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;

const HEADING = cn(
  'text-center text-[38px] font-extrabold leading-[1.1] tracking-[-0.02em]',
  'text-[#3A343B] dark:text-[#F3E8EE] max-md:text-3xl'
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
  onOpenChat,
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
  // first keystroke, and stays up even when the field is cleared — the page
  // never jumps back and forth. Only leaving the live-search modes or a minute
  // without any input centres it.
  const [raised, setRaised] = useState(false);
  const hasText = composerText.trim().length > 0;
  if (raised && !liveSearch) setRaised(false);

  const composerRuntime = useAui().composer;
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!raised) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      clearTimeout(fade);
      setLeaving(false);
      idle = setTimeout(() => {
        setLeaving(true);
        fade = setTimeout(() => {
          composerRuntime.setText('');
          setSubmitted(null);
          setRaised(false);
          setLeaving(false);
        }, FADE_MS);
      }, IDLE_RETURN_MS);
    };
    arm();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, arm, { passive: true });
    return () => {
      clearTimeout(idle);
      clearTimeout(fade);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, arm);
    };
  }, [raised, composerRuntime]);

  const magicIntent: MagicIntent | null =
    !omniComposer && answerMode === 'auto' && manualSearchAvailable && hasText
      ? detectMagicIntent(composerText)
      : null;

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
          // Heading and composer sit centred on the empty page; once hits
          // come in the composer moves up to give them the page.
          raised ? 'pt-10' : 'pt-[max(2.5rem,calc(50dvh-10rem))] max-md:pt-[8vh]'
        )}
      >
        {/* The heading folds away with the first hits; it stays in the DOM so
            screen readers keep the page's title. */}
        <div
          className={cn(
            'grid w-full transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none',
            raised ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'
          )}
        >
          <div className="overflow-hidden">
            <h1 className={cn(HEADING, 'mb-8')}>{title}</h1>
          </div>
        </div>
        <div className={cn('w-full max-w-2xl', NOTEBOOK_COMPOSER_ACCENT)}>
          {/* With live hits the filters sit in the hit list's toolbar; the
              settings menu keeps them only where there is no list. */}
          <NotebookComposer
            placeholder={placeholder}
            sourceFilters={liveSearch ? undefined : composerSourceFilters}
            categoryFilters={liveSearch ? undefined : composerCategoryFilters}
            mode={mode}
            onModeChange={onModeChange}
            answerMode={answerMode}
            onAnswerModeChange={onAnswerModeChange}
            magicIntent={magicIntent}
            settingsClassName={NOTEBOOK_COMPOSER_ACCENT}
            {...(onOpenChat ? { onChatSubmit: onOpenChat } : {})}
            {...(manualSearchAvailable ? { onManualSubmit: setSubmitted } : {})}
          />
        </div>
      </div>

      {/* Hits take the page's width (four to five columns on a wide screen). */}
      {liveSearch && (
        <div
          className={cn(
            'mx-auto w-full pb-10 pt-10 transition-opacity duration-500 ease-out motion-reduce:transition-none',
            leaving && 'opacity-0',
            hasHits ? 'max-w-none' : 'max-w-3xl px-6 md:px-0'
          )}
        >
          <NotebookLiveSearch
            text={composerText}
            submitted={submitted}
            collectionIds={recentCollectionIds}
            {...(manualSearchNotebookId ? { notebookId: manualSearchNotebookId } : {})}
            {...(composerCategoryFilters ? { sharedFilters: composerCategoryFilters } : {})}
            {...(composerSourceFilters ? { sourceFilters: composerSourceFilters } : {})}
            emptyHint={
              answerMode === 'manuell' || magicIntent === 'suche'
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
