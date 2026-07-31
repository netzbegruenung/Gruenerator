'use client';

import { X } from 'lucide-react';
import { memo } from 'react';

import { usePacedLabel } from '../../../hooks/usePacedLabel';
import { ShimmerText } from '../../message-parts/ShimmerText';

import type { ProgressStep } from '../../../hooks/useChatGraphStream';

interface ProgressTrackerComponentProps {
  steps: ProgressStep[];
  totalTimeMs?: number;
  /** Live split-gather narration awaiting a tool card. When present its latest
   *  sentence is shown (paced) instead of the static step label, so the running
   *  status line reads like ChatGPT's between-tool prose. */
  pendingNarration?: string[];
  /** The running retrieval step ("Websuche „Klimageld""). Retrieval draws no
   *  card of its own, so this line is where it gets reported — more concrete
   *  than the stage word, less specific than planner narration. */
  toolStatus?: string;
}

export const ProgressTracker = memo(function ProgressTracker({
  steps,
  pendingNarration,
  toolStatus,
}: ProgressTrackerComponentProps) {
  const failed = steps.find((s) => s.status === 'failed');
  const active = steps.find((s) => s.status === 'in-progress') ?? steps[steps.length - 1];
  // Three sources, most specific first: planner prose → the running retrieval
  // step → the static stage label. Paced so a burst stays readable rather than
  // flashing by. Hook runs unconditionally (before any early return).
  const rawLabel =
    pendingNarration && pendingNarration.length > 0
      ? pendingNarration[pendingNarration.length - 1]
      : (toolStatus ?? active?.label ?? '');
  const pacedLabel = usePacedLabel(rawLabel);

  if (steps.length === 0) return null;

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-error-bg px-3 py-1.5 text-xs text-error">
        <X className="h-3.5 w-3.5" />
        <span className="font-medium">{failed.label}</span>
      </div>
    );
  }

  if (!active || active.status === 'completed') return null;

  return (
    <div className="px-3 py-1.5 text-sm">
      {/* key on the paced value → each swap replays the 0.2s crossfade. */}
      <span key={pacedLabel} className="status-line-swap inline-block">
        <ShimmerText>{pacedLabel}</ShimmerText>
      </span>
    </div>
  );
});
