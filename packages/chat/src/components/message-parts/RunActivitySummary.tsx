'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import type { RunActivityView } from '../../lib/runActivityView';

/**
 * The trace a finished turn keeps once its status line is gone — collapsed to
 * `Gearbeitet für 1 Min. 40 Sek. · 6 Schritte`, expandable to the steps in the
 * order they ran. Whether a turn gets it is `selectRunActivity`'s call; this
 * only draws it. Same pill as ToolCallGroup's collapsed run, so the two read
 * as one family.
 */
export function RunActivitySummary({ view }: { view: RunActivityView }) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className="mb-1.5 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-foreground-muted transition-colors hover:bg-primary/10 hover:text-foreground"
      >
        <span>{view.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ol
          id={listId}
          className="mt-1.5 mb-3 ml-2 space-y-1 border-l-2 border-primary/20 pl-3 text-[13px] text-foreground-muted"
        >
          {view.steps.map((step) => (
            <li key={step.id} className="break-words">
              {step.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
