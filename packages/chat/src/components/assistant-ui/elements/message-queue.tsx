/**
 * Vendored from the assistant-ui Elements registry. Re-sync with:
 *   curl -s https://r.assistant-ui.com/elements-message-queue.json | jq -r '.files[0].content'
 *
 * TWO deviations. Keep them when re-syncing, and add none without a reason —
 * every one is a hand edit somebody owes on the next sync:
 *   1. `cn` comes from ./_adapter; packages/chat has no "@/" alias at build time.
 *   2. the four user-facing strings are German; the count needs a singular
 *      ("1 wartet") that upstream's "{n} queued" does not; and the remove
 *      button's name carries the row number as well as the text, because
 *      upstream's text-only name repeats when the same turn is queued twice.
 *
 * Everything else is upstream's, including the running row, the row numbering
 * and the enter animation. `max-w-sm` needs no deviation: className merges
 * through tailwind-merge, so the caller passing `max-w-none` wins.
 *
 * The runtime wiring lives in thread/ComposerQueueList.tsx — this file stays
 * presentational so a re-sync never has to reason about the queue runtime.
 */
'use client';

import type { ComponentProps } from 'react';
import { ArrowUpIcon, XIcon } from 'lucide-react';
import { cn } from './_adapter';
import { field, ghostButton, mono, paper } from './surfaces';

export interface QueuedMessage {
  id: string;
  text: string;
}

export function MessageQueue({
  running,
  queued,
  onCancel,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'running' | 'queued' | 'onCancel'> & {
  running: string;
  queued: readonly QueuedMessage[];
  onCancel?: (id: string) => void;
}) {
  return (
    <div
      data-slot="message-queue"
      className={cn('flex w-full max-w-sm flex-col gap-2', className)}

      {...props}
    >
      <div className={cn(paper, 'flex items-center gap-2.5 rounded-2xl p-3')}>
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500/60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-blue-500 dark:bg-blue-400" />
        </span>
        <span className="text-foreground/90 min-w-0 flex-1 truncate text-[13.5px]">{running}</span>
        <span className={cn(mono, 'text-foreground/35 shrink-0')}>läuft</span>
      </div>

      {queued.length > 0 && (
        <div className="flex items-baseline justify-between px-1">
          <span className={cn(mono, 'text-foreground/35')}>
            {queued.length === 1 ? '1 wartet' : `${queued.length} warten`}
          </span>
          <span className={cn(mono, 'text-foreground/35')}>sobald die Antwort fertig ist</span>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {queued.map((message, index) => (
          <li
            key={message.id}
            className={cn(
              field,
              'fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex items-center gap-2.5 rounded-2xl py-2 pr-2 pl-3 duration-300'
            )}
          >
            <span className={cn(mono, 'text-foreground/30 w-3 shrink-0 tabular-nums')}>
              {index + 1}
            </span>
            <span className="text-foreground/60 min-w-0 flex-1 truncate text-[13.5px]">
              {message.text}
            </span>
            <ArrowUpIcon className="text-foreground/25 size-3 shrink-0" />
            <button
              type="button"
              aria-label={`Wartende Nachricht ${index + 1} entfernen: "${message.text}"`}
              onClick={() => onCancel?.(message.id)}
              className={cn(ghostButton, 'size-6 shrink-0')}
            >
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
