'use client';

import { Archive } from 'lucide-react';

import { useAgentStore } from '../../stores/chatStore';

/**
 * Subtle banner shown when the current thread's older messages have been
 * summarized into a compaction summary (see compactionService on the backend).
 * Purely informational — reads the summary already loaded into the store by
 * loadCompactionState; renders nothing when there is no summary.
 */
export function CompactionIndicator() {
  const summary = useAgentStore((s) => s.compactionState.summary);
  if (!summary) return null;

  return (
    <div
      className="mx-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary-50 px-3 py-1 text-xs text-foreground-muted dark:bg-secondary-800/40"
      title="Ältere Nachrichten wurden zusammengefasst, um den Kontext kompakt zu halten."
    >
      <Archive className="h-3 w-3" aria-hidden="true" />
      Älterer Verlauf zusammengefasst
    </div>
  );
}
