'use client';

import {
  ComposerPrimitive,
  QueueItemPrimitive,
  useAuiState,
  type QueueItemState,
} from '@assistant-ui/react';
import { ArrowUpIcon, XIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { field, ghostButton } from '../assistant-ui/elements/surfaces';

interface ComposerQueueListProps {
  className?: string;
}

/**
 * Turns typed while an answer is still streaming, built on assistant-ui's
 * runtime primitives (`ComposerPrimitive.Queue` + `QueueItemPrimitive.*`), the
 * runtime mode of upstream's MessageQueue element.
 *
 * "Als Nächstes senden" is `QueueItemPrimitive.Steer`. On our `LocalRuntime` it
 * moves the turn to the front of the queue and does NOT interrupt the running
 * answer: the local runtime builds its queue without a `cancel` driver, and
 * only that driver lets a steer abort the run. An interrupting variant cannot
 * be built from outside either — a queue item exposes only its `parts`, so
 * removing and re-appending it would drop attachments and `runConfig`.
 *
 * The first row hides the button: it already goes next.
 */
export function ComposerQueueList({ className }: ComposerQueueListProps) {
  const count = useAuiState((s) => s.composer.queue.length);

  if (count === 0) return null;

  return (
    <div data-slot="message-queue" className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-foreground-muted px-1 text-xs">
        {count === 1 ? '1 Nachricht wartet' : `${count} Nachrichten warten`} – sie werden gesendet,
        sobald die Antwort fertig ist
      </span>
      <ul className="flex flex-col gap-1">
        <ComposerPrimitive.Queue>
          {({ queueItem }) => <QueueRow item={queueItem} />}
        </ComposerPrimitive.Queue>
      </ul>
    </div>
  );
}

function QueueRow({ item }: { item: QueueItemState }) {
  // The render prop hands over no position. A number is Object.is-stable, so
  // this does not re-render the row on every streamed token.
  const position = useAuiState((s) => s.composer.queue.findIndex((q) => q.id === item.id)) + 1;
  const label = labelOf(item);

  return (
    <li className={cn(field, 'flex min-w-0 items-center gap-1 rounded-xl py-1 pr-1 pl-3')}>
      <QueueItemPrimitive.Text className="text-foreground/80 min-w-0 flex-1 truncate text-[13.5px]">
        {label}
      </QueueItemPrimitive.Text>
      {position > 1 && (
        <QueueItemPrimitive.Steer
          aria-label={`Als Nächstes senden: Nachricht ${position}`}
          className={cn(ghostButton, 'h-7 shrink-0 gap-1 px-2 text-xs')}
        >
          <ArrowUpIcon className="size-3.5" />
          Als Nächstes senden
        </QueueItemPrimitive.Steer>
      )}
      {/* The position keeps the names apart when the same turn waits twice. */}
      <QueueItemPrimitive.Remove
        aria-label={`Wartende Nachricht ${position} entfernen: „${label}“`}
        className={cn(ghostButton, 'size-7 shrink-0')}
      >
        <XIcon className="size-3.5" />
      </QueueItemPrimitive.Remove>
    </li>
  );
}

/**
 * The text parts, or the file names for a turn that carries only files —
 * otherwise that row would be blank. `prompt` is deprecated upstream (removal
 * after 2026-11-05), so the parts are the durable source.
 */
function labelOf(item: QueueItemState): string {
  const text = item.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
  if (text) return text;
  return item.parts
    .map((part) => (part.type === 'file' ? (part.filename ?? '') : ''))
    .filter(Boolean)
    .join(', ');
}
