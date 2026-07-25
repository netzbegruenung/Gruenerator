'use client';

import { useRef, type ReactNode } from 'react';
import { ProgressIndicator } from './ProgressIndicator';
import { ProgressTracker } from '../tool-ui/progress-tracker/ProgressTracker';
import { TypingIndicator } from './TypingIndicator';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { type ProgressDisplay } from './progressDisplayContext';
import type { ChatMessageMetadata } from '../../types/messageMetadata';

interface StreamingStatusLineProps {
  isStreaming: boolean;
  hasToolCall: boolean;
  textContent: string;
  custom: ChatMessageMetadata | undefined;
  progressDisplay: ProgressDisplay;
  agentColor: string;
}

/**
 * The single streaming status element (typing dots / progress tracker / paced
 * narration line) shown above a message body. Centralizes the old inline
 * branching from AssistantMessage and adds a graceful fade-out on stream end
 * (via the unit-tested `useDelayedUnmount`) instead of vanishing instantly.
 * The paced/crossfaded label itself lives inside Progress{Tracker,Indicator}.
 */
export function StreamingStatusLine({
  isStreaming,
  hasToolCall,
  textContent,
  custom,
  progressDisplay,
  agentColor,
}: StreamingStatusLineProps): ReactNode {
  const stage = custom?.progress?.stage;
  const progress = custom?.progress;
  const concrete =
    stage === 'searching' || stage === 'generating' || stage === 'generating_image';

  const progressEl =
    progress &&
    (progress.steps ? (
      <ProgressTracker
        steps={progress.steps}
        agentColor={agentColor}
        totalTimeMs={custom?.streamMetadata?.totalTimeMs}
        {...(progress.pendingNarration ? { pendingNarration: progress.pendingNarration } : {})}
      />
    ) : (
      <ProgressIndicator progress={progress} agentColor={agentColor} variant={progressDisplay} />
    ));

  let node: ReactNode = null;
  if (!hasToolCall) {
    if (concrete && progressEl) node = progressEl;
    else if (!textContent) node = <TypingIndicator />;
  } else if (!textContent && progressEl && (stage === 'generating' || stage === 'searching')) {
    node = progressEl;
  }

  const active = isStreaming && node !== null;
  const { mounted, exiting } = useDelayedUnmount(active);

  // Remember the last shown element so the fade-out renders content even after
  // the underlying progress metadata has already cleared (stage → complete).
  const lastRef = useRef<ReactNode>(null);
  if (node !== null) lastRef.current = node;

  if (!mounted) return null;
  const shown = node ?? lastRef.current;
  if (shown == null) return null;

  return <div className={exiting ? 'status-line-exit' : undefined}>{shown}</div>;
}
