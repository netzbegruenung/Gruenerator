'use client';

import { useAui, useAuiState } from '@assistant-ui/react';
import { cn } from '@gruenerator/ui';
import { X } from 'lucide-react';

interface ComposerQueueListProps {
  className?: string;
}

/**
 * Turns the user typed while a run was still streaming, waiting their turn.
 *
 * The rows are built by hand rather than with `ComposerPrimitive.Queue`: its
 * render prop hands over one item at a time without its position, and the
 * position is the whole point of the numbering. Doing the mapping here also
 * keeps the markup portable to React Native, which ships no queue primitives.
 *
 * There is no row for the turn currently running — that one is already visible
 * in the thread above, and repeating it here would just be a second copy that
 * can disagree.
 */
export function ComposerQueueList({ className }: ComposerQueueListProps) {
  const queue = useAuiState((s) => s.composer.queue);
  const composer = useAui().composer;

  if (queue.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="text-xs text-foreground-muted">
        {queue.length === 1
          ? 'Wird gesendet, sobald die Antwort fertig ist'
          : `${queue.length} Nachrichten werden gesendet, sobald die Antwort fertig ist`}
      </p>
      <ul className="flex flex-col gap-1">
        {queue.map((item, index) => {
          // `prompt` is deprecated upstream (removal after 2026-11-05); the
          // text parts are the durable shape. Files carry no text and are
          // skipped, so an attachment-only turn shows as a numbered row with
          // an empty label rather than breaking the list.
          const label = item.parts
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join('')
            .trim();

          return (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-2xl bg-black/[0.05] py-1 pl-3 pr-1 text-[13px] text-foreground dark:bg-white/10"
            >
              <span aria-hidden="true" className="shrink-0 tabular-nums text-foreground-muted">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <button
                type="button"
                // Selected by id, not by index: removing one row shifts every
                // later index, and a click landing after that shift would hit
                // the wrong turn.
                onClick={() => composer.queueItem({ id: item.id }).remove()}
                aria-label={`Wartende Nachricht ${index + 1} entfernen`}
                // 24 px hit area (WCAG 2.2 SC 2.5.8) around a 12 px glyph.
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-black/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
