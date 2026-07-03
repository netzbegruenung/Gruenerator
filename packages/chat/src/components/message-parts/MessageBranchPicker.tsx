'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMessage, useMessageRuntime } from '@assistant-ui/react';

/**
 * Compact ‹ n/m › switcher shown when a message has sibling branches — created
 * in-session by regenerate (assistant) or edit-resubmit (user). Backend keeps
 * only the latest version, so this disappears after a reload.
 */
export function MessageBranchPicker() {
  const runtime = useMessageRuntime();
  const message = useMessage();
  const { branchNumber, branchCount } = message;

  if (branchCount <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 text-xs text-foreground-muted">
      <button
        type="button"
        onClick={() => runtime.switchToBranch({ position: 'previous' })}
        disabled={branchNumber <= 1}
        className="rounded p-1 hover:bg-primary/10 hover:text-foreground disabled:opacity-40"
        aria-label="Vorherige Version"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="tabular-nums">
        {branchNumber}/{branchCount}
      </span>
      <button
        type="button"
        onClick={() => runtime.switchToBranch({ position: 'next' })}
        disabled={branchNumber >= branchCount}
        className="rounded p-1 hover:bg-primary/10 hover:text-foreground disabled:opacity-40"
        aria-label="Nächste Version"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
