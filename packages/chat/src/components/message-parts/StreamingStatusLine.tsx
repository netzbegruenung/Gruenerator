'use client';

import { useRef, type ReactNode } from 'react';

import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { selectStatusLineView } from '../../lib/statusLineView';
import { ProgressTracker } from '../tool-ui/progress-tracker/ProgressTracker';

import { ProgressIndicator } from './ProgressIndicator';
import { StatusLineDetails } from './StatusLineDetails';
import { TypingIndicator } from './TypingIndicator';

import type { ChatMessageMetadata } from '../../types/messageMetadata';
import type { SerializableCitation } from '../tool-ui/citation/schema';

interface StreamingStatusLineProps {
  isStreaming: boolean;
  /** The turn has detail of its own (a tool step or reasoning). Such a line
   *  only shows BEFORE the answer text starts — a turn with neither keeps the
   *  older behaviour of narrating alongside the streaming prose. */
  hasOwnDetail: boolean;
  textContent: string;
  custom: ChatMessageMetadata | undefined;
  /** The running retrieval step ("Websuche „Klimageld"") — see toolStatusLine. */
  toolStatus?: string | null;
  /** Dropdown content: the model's thinking so far. */
  reasoningText?: string | null;
  /** Dropdown content: what the retrieval steps have found so far. */
  sources?: ReadonlyArray<SerializableCitation>;
}

const NO_SOURCES: ReadonlyArray<SerializableCitation> = [];

/**
 * The single streaming status element (typing dots / progress tracker / paced
 * narration line) shown above a message body. Centralizes the old inline
 * branching from AssistantMessage and adds a graceful fade-out on stream end
 * (via the unit-tested `useDelayedUnmount`) instead of vanishing instantly.
 * The paced/crossfaded label itself lives inside Progress{Tracker,Indicator}.
 *
 * Retrieval steps and reasoning have no block of their own; `toolStatus` is how
 * a search gets said, and `reasoningText`/`sources` hang under the line as a
 * dropdown. All of it disappears with the line the moment the answer text
 * starts — the thinking is not persisted anyway, and the sources reappear in
 * the message's Quellen-Liste.
 */
export function StreamingStatusLine({
  isStreaming,
  hasOwnDetail,
  textContent,
  custom,
  toolStatus = null,
  reasoningText = null,
  sources = NO_SOURCES,
}: StreamingStatusLineProps): ReactNode {
  const stage = custom?.progress?.stage;
  const progress = custom?.progress;

  const labelEl =
    progress &&
    (progress.steps ? (
      <ProgressTracker
        steps={progress.steps}
        totalTimeMs={custom?.streamMetadata?.totalTimeMs}
        {...(progress.pendingNarration ? { pendingNarration: progress.pendingNarration } : {})}
        {...(toolStatus ? { toolStatus } : {})}
      />
    ) : (
      <ProgressIndicator progress={progress} {...(toolStatus ? { toolStatus } : {})} />
    ));

  const progressEl = labelEl && (
    <StatusLineDetails reasoningText={reasoningText} sources={sources}>
      {labelEl}
    </StatusLineDetails>
  );

  // Which of the three elements to show — the rule itself lives in
  // `selectStatusLineView`, shared verbatim with mobile's ChatStatusLine.
  const view = selectStatusLineView({
    hasOwnDetail,
    hasText: textContent.length > 0,
    stage,
    hasProgress: progress != null,
  });

  let node: ReactNode = null;
  if (view === 'progress') node = progressEl ?? null;
  else if (view === 'typing') node = <TypingIndicator />;

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
