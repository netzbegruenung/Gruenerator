'use client';

import { Calculator } from 'lucide-react';

import type { ComputeData } from '../../hooks/useChatGraphStream';

/**
 * Inline card for a deterministic calculation (compute intent). Its whole
 * purpose is transparency: the numbers were computed in plain JS on the server
 * (not guessed by the model), and this card shows the user exactly that — a
 * labelled tool produced the figures. Purely presentational; no panel/store.
 */
export function ComputeCard({ data }: { data: ComputeData }) {
  return (
    <div
      className="my-2 w-full rounded-lg border border-border bg-background p-3"
      role="group"
      aria-label={`Berechnung: ${data.operation}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Calculator className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium text-foreground">{data.operation}</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-foreground-muted">
          exakt berechnet
        </span>
      </div>
      <dl className="divide-y divide-border/60">
        {data.entries.map((entry, i) => (
          <div
            key={`${entry.label}-${i}`}
            className="flex items-baseline justify-between gap-3 py-1"
          >
            <dt className="min-w-0 truncate text-xs text-foreground-muted">{entry.label}</dt>
            <dd className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
