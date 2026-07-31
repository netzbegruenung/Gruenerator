'use client';

import { usePacedLabel } from '../../hooks/usePacedLabel';

import { ShimmerText } from './ShimmerText';

import type { ChatProgress } from '../../hooks/useChatGraphStream';

interface ProgressIndicatorProps {
  progress: ChatProgress;
  /** The running retrieval step ("Websuche „Klimageld""). Retrieval draws no
   *  card of its own, so this line is where it gets reported. */
  toolStatus?: string;
}

/**
 * The inline streaming status: shimmering text, nothing else.
 *
 * There used to be a second treatment — a tinted `bg-primary/5` box with an
 * agent-colored dot — justified by the search tool-call drawing its own pill
 * right after. #2213 removed that pill and moved retrieval into this line, which
 * left the box as a lone chip that read like the very pill that was removed.
 * Both treatments are now one: the status IS the shimmer.
 */
export function ProgressIndicator({ progress, toolStatus }: ProgressIndicatorProps) {
  // Three sources, most specific first: split-gather narration → the running
  // retrieval step → the raw stage message. Paced so bursts stay readable.
  // Hook runs before any early return.
  const pending = progress.pendingNarration;
  const rawMessage =
    pending && pending.length > 0 ? pending[pending.length - 1] : (toolStatus ?? progress.message);
  const message = usePacedLabel(rawMessage);

  if (
    progress.stage === 'idle' ||
    progress.stage === 'complete' ||
    progress.stage === 'classifying' ||
    progress.intent === 'direct' ||
    progress.intent === 'greeting'
  ) {
    return null;
  }

  return progress.stage === 'error' ? (
    <span className="text-sm text-error">{progress.message}</span>
  ) : (
    <span key={message} className="status-line-swap inline-block">
      <ShimmerText className="text-sm">{message}</ShimmerText>
    </span>
  );
}
