import {
  buildSitePreviewSnapshot,
  siteDraftToSnapshotSource,
  type SiteContentDraft,
  type SiteGenerationStep,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useGenerationFocus } from '../components/common/useGenerationFocus';
import { liveSiteDraft } from '../generation/liveDraft';
import { SITE_GENERATION_STEP_LABELS } from '../generation/stepLabels';
import { SitePreviewFrame } from '../preview/SitePreviewFrame';

/** Draft keys in page order, with the block type each one fills. */
const SECTIONS = [
  ['hero', 'hero'],
  ['about', 'about'],
  ['hero_image', 'heroImage'],
  ['themes', 'themes'],
  ['actions', 'actions'],
  ['contact', 'contact'],
] as const;

/** The block the model is writing now: the last section the draft has reached. */
function writingBlock(draft: SiteContentDraft): string | null {
  let block: string | null = null;
  for (const [key, type] of SECTIONS) if (draft[key] !== undefined) block = type;
  return block;
}

/**
 * Keeps the section being written in view, one jump per new section rather than per word. The
 * first scroll, wheel, touch or key of the person ends it: from then on they decide where to look.
 */
function useFollowWriting(doc: Document | null, block: string | null) {
  const following = useRef(true);

  useEffect(() => {
    if (!doc) return;
    const stop = () => {
      following.current = false;
    };
    const events = ['wheel', 'touchmove', 'keydown'] as const;
    for (const event of events) doc.addEventListener(event, stop, { passive: true });
    return () => {
      for (const event of events) doc.removeEventListener(event, stop);
    };
  }, [doc]);

  useEffect(() => {
    if (!doc || !block || !following.current) return;
    const reduce = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    doc
      .querySelector(`[data-block-id="live-${block}"]`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [doc, block]);
}

interface LiveSitePreviewProps {
  draft: SiteContentDraft;
  contactEmail: string;
  handle: string;
  locale: SupportedLocale;
  steps: readonly SiteGenerationStep[];
  current: SiteGenerationStep | null;
  /** The content is done and the site is being stored; there is nothing left to cancel. */
  creating: boolean;
  onCancel?: () => void;
}

/**
 * The site while the model writes it, in the editor's own canvas: the text fills in, the images
 * arrive one by one, and the editor opens on the same page. Replaces the progress card once the
 * first draft has arrived.
 */
export function LiveSitePreview({
  draft,
  contactEmail,
  handle,
  locale,
  steps,
  current,
  creating,
  onCancel,
}: LiveSitePreviewProps) {
  const snapshot = useMemo(
    () =>
      buildSitePreviewSnapshot(
        siteDraftToSnapshotSource(liveSiteDraft(draft, contactEmail), null),
        locale
      ),
    [draft, contactEmail, locale]
  );
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  useFollowWriting(frameDoc, writingBlock(draft));

  return (
    <div className="relative h-full w-full">
      <SitePreviewFrame
        snapshot={snapshot}
        handle={handle}
        title="Deine Website entsteht"
        className="block h-full w-full border-0"
        onFrameDocument={setFrameDoc}
      />
      <LiveStatus steps={steps} current={current} creating={creating} onCancel={onCancel} />
    </div>
  );
}

function LiveStatus({
  steps,
  current,
  creating,
  onCancel,
}: Pick<LiveSitePreviewProps, 'steps' | 'current' | 'creating' | 'onCancel'>) {
  const cancel = creating ? undefined : onCancel;
  const ref = useGenerationFocus<HTMLElement>(cancel);
  const index = current ? steps.indexOf(current) : -1;
  const label = creating
    ? 'Seite wird angelegt …'
    : current
      ? `${SITE_GENERATION_STEP_LABELS[current]} …`
      : 'Es geht gleich los …';

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label="Fortschritt"
      className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-sm rounded-full border border-grey-200 bg-background-pure py-xs pr-xs pl-md text-sm text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.18)] outline-none dark:border-grey-700"
    >
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full bg-secondary-600 motion-safe:animate-pulse"
      />
      <p role="status" className="m-0 font-semibold">
        {label}
      </p>
      {!creating && index >= 0 && steps.length > 1 && (
        <span className="text-grey-600 dark:text-grey-400 whitespace-nowrap">
          Schritt {index + 1} von {steps.length}
        </span>
      )}
      {cancel && (
        <Button variant="brand-outline" size="sm" onClick={cancel}>
          Abbrechen
        </Button>
      )}
    </section>
  );
}
