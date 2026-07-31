// The two decisions behind the streaming status element above a message body:
// WHAT it shows (shimmering label / typing dots / nothing) and WHICH label.
//
// Platform-neutral and free of react/DOM imports, because the point is that web
// and mobile share ONE rule. They previously each carried their own if-chain,
// hand-synced by comment ("mirror web's early return") — and drifted: mobile
// copied the gates off `ProgressIndicator`, which the chat surface does not even
// render (`progress.steps` is always set, so `StreamingStatusLine` always picks
// `ProgressTracker`). One of those gates, `intent !== 'direct'`, suppressed the
// label for every turn that answers without searching — i.e. most of them, and
// all of them on mobile, where web search is off.

import type { ProgressStage, ProgressStep } from '../hooks/useChatGraphStream';

/** The one streaming status element: a shimmering label, the dots, or nothing. */
export type StatusLineView = 'progress' | 'typing' | 'none';

/** Stages whose label is worth showing on a turn that has no detail of its own. */
const CONCRETE_STAGES: ReadonlySet<ProgressStage> = new Set([
  'searching',
  'generating',
  'generating_image',
]);

/**
 * The narrower set that still shows a label once the turn HAS detail of its own
 * (a tool card or reasoning). `generating_image` is missing on purpose: a
 * sharepic turn's card already says "Sharepic wird erstellt", so the line above
 * it would be the same sentence twice.
 */
const DETAIL_STAGES: ReadonlySet<ProgressStage> = new Set(['searching', 'generating']);

export interface StatusLineInput {
  /** The turn has a tool card or reasoning part — see AssistantMessage. */
  hasOwnDetail: boolean;
  /** Answer text has started streaming. */
  hasText: boolean;
  stage: ProgressStage | undefined;
  /**
   * The turn carries progress metadata at all. Deliberately NOT "the label is
   * non-empty": the progress element decides for itself whether it draws (all
   * steps completed → nothing), and a turn that is demonstrably working should
   * not fall back to the dots just because the label is between values.
   */
  hasProgress: boolean;
}

/**
 * Which status element to render. A turn with no detail of its own narrates
 * alongside its streaming prose; a turn with a card or reasoning retires the
 * line the moment the answer text starts (the thinking is not persisted anyway,
 * and the sources reappear in the message's Quellen-Liste).
 */
export function selectStatusLineView({
  hasOwnDetail,
  hasText,
  stage,
  hasProgress,
}: StatusLineInput): StatusLineView {
  const concrete = stage !== undefined && CONCRETE_STAGES.has(stage);
  const detailStage = stage !== undefined && DETAIL_STAGES.has(stage);

  if (!hasOwnDetail) {
    if (hasProgress && concrete) return 'progress';
    // Nothing concrete to say yet (classifying) — the dots stand in until it is,
    // but only while the answer itself is still missing.
    return hasText ? 'none' : 'typing';
  }

  if (!hasText && hasProgress && detailStage) return 'progress';
  return 'none';
}

export interface StatusLabel {
  label: string;
  /** A failed step: readable, but never shimmering — shimmer reads as "running". */
  failed: boolean;
}

export interface StatusLabelInput {
  steps?: readonly ProgressStep[] | undefined;
  /** Live split-gather narration awaiting a tool card. */
  pendingNarration?: readonly string[] | undefined;
  /** The running retrieval step ("Websuche „Klimageld"") — see toolStatusLine. */
  toolStatus?: string | null | undefined;
  /** Last resort for adapters that stream no step list (notebook QA). */
  message?: string | undefined;
}

/**
 * The one sentence the status line says, or null for "stay quiet".
 *
 * Four sources, most specific first: a failed step outranks everything (a later
 * step may already be running past it), then planner prose, then the running
 * retrieval step, then the static stage word.
 */
export function selectStatusLabel({
  steps,
  pendingNarration,
  toolStatus,
  message,
}: StatusLabelInput): StatusLabel | null {
  const failed = steps?.find((s) => s.status === 'failed');
  if (failed) return { label: failed.label, failed: true };

  let stepLabel: string | undefined;
  if (steps && steps.length > 0) {
    const active = steps.find((s) => s.status === 'in-progress') ?? steps[steps.length - 1];
    // Nothing in flight — the answer is about to take this space, so don't leave
    // a finished step standing.
    if (!active || active.status === 'completed') return null;
    stepLabel = active.label;
  }

  const label =
    pendingNarration && pendingNarration.length > 0
      ? pendingNarration[pendingNarration.length - 1]
      : (toolStatus ?? stepLabel ?? message);

  if (!label) return null;
  return { label, failed: false };
}
