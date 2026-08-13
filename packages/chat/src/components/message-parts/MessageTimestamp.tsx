'use client';

import { useAuiState } from '@assistant-ui/react';

import { cn } from '../../lib/utils';

import { buildDaySeparatorLabels, type DatedEntry } from './messageTimestampLabels';

const timeFormat = new Intl.DateTimeFormat('de', { hour: '2-digit', minute: '2-digit' });

// One O(N) pass per messages-array identity, shared by all N separator
// instances. Without this every instance ran its own scan on every thread
// update — O(N²) across a streamed answer, since each token publishes a new
// array to all subscribers.
const labelCache = new WeakMap<readonly DatedEntry[], Map<string, string | null>>();

function separatorLabelsFor(messages: readonly DatedEntry[]): Map<string, string | null> {
  let labels = labelCache.get(messages);
  if (!labels) {
    labels = buildDaySeparatorLabels(messages, new Date());
    labelCache.set(messages, labels);
  }
  return labels;
}

/**
 * Horizontal rule with a day label, rendered above a message whose calendar day
 * differs from the previous message's. The very first message only gets one
 * when its day is NOT today — a lone "Heute" over a fresh chat says nothing.
 */
export function MessageDaySeparator() {
  const label = useAuiState((s) => separatorLabelsFor(s.thread.messages).get(s.message.id) ?? null);

  if (!label) return null;

  return (
    <div
      role="separator"
      aria-label={label}
      className="mx-auto flex w-full max-w-3xl items-center gap-2.5 py-1"
    >
      <span className="h-px flex-1 bg-foreground/10" aria-hidden />
      <span className="text-xs tabular-nums text-foreground-muted">{label}</span>
      <span className="h-px flex-1 bg-foreground/10" aria-hidden />
    </div>
  );
}

/** The message's send time (HH:MM). Reveal (hover-gating) is the caller's job. */
export function MessageTime({ className }: { className?: string }) {
  const time = useAuiState((s) => {
    const d = s.message.createdAt;
    return d ? timeFormat.format(d) : null;
  });

  if (!time) return null;

  return (
    <span className={cn('shrink-0 text-xs tabular-nums text-foreground-muted', className)}>
      {time}
    </span>
  );
}
