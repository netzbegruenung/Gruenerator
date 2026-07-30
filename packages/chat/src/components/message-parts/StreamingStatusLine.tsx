'use client';

import { useRef, type ReactNode } from 'react';

import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { ProgressTracker } from '../tool-ui/progress-tracker/ProgressTracker';

import { type ProgressDisplay } from './progressDisplayContext';
import { ProgressIndicator } from './ProgressIndicator';
import { TypingIndicator } from './TypingIndicator';

import type { ChatMessageMetadata } from '../../types/messageMetadata';

interface StreamingStatusLineProps {
  isStreaming: boolean;
  /** Any tool ran this turn — including a cardless retrieval step, which is
   *  what keeps this line retiring the moment the answer text starts. */
  hasToolCall: boolean;
  textContent: string;
  custom: ChatMessageMetadata | undefined;
  progressDisplay: ProgressDisplay;
  agentColor: string;
  /** The running retrieval step ("Websuche „Klimageld"") — see toolStatusLine. */
  toolStatus?: string | null;
}

/**
 * The single streaming status element (typing dots / progress tracker / paced
 * narration line) shown above a message body. Centralizes the old inline
 * branching from AssistantMessage and adds a graceful fade-out on stream end
 * (via the unit-tested `useDelayedUnmount`) instead of vanishing instantly.
 * The paced/crossfaded label itself lives inside Progress{Tracker,Indicator}.
 *
 * Retrieval steps have no card of their own; `toolStatus` is how they get said,
 * overriding the generic stage word so the line names the actual search — and
 * disappearing with the whole line the moment the answer text starts.
 */
export function StreamingStatusLine({
  isStreaming,
  hasToolCall,
  textContent,
  custom,
  progressDisplay,
  agentColor,
  toolStatus = null,
}: StreamingStatusLineProps): ReactNode {
  const stage = custom?.progress?.stage;
  const progress = custom?.progress;
  const concrete = stage === 'searching' || stage === 'generating' || stage === 'generating_image';

  const progressEl =
    progress &&
    (progress.steps ? (
      <ProgressTracker
        steps={progress.steps}
        agentColor={agentColor}
        totalTimeMs={custom?.streamMetadata?.totalTimeMs}
        {...(progress.pendingNarration ? { pendingNarration: progress.pendingNarration } : {})}
        {...(toolStatus ? { toolStatus } : {})}
      />
    ) : (
      <ProgressIndicator
        progress={progress}
        agentColor={agentColor}
        variant={progressDisplay}
        {...(toolStatus ? { toolStatus } : {})}
      />
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
