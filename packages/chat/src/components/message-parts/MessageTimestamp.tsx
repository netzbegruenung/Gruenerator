'use client';

import { useAuiState } from '@assistant-ui/react';

import { cn } from '../../lib/utils';

const timeFormat = new Intl.DateTimeFormat('de', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('de', { day: 'numeric', month: 'long', year: 'numeric' });

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return 'Heute';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'Gestern';
  return dayFormat.format(d);
}

/**
 * Horizontal rule with a day label, rendered above a message whose calendar day
 * differs from the previous message's. The very first message only gets one
 * when its day is NOT today — a lone "Heute" over a fresh chat says nothing.
 */
export function MessageDaySeparator() {
  const label = useAuiState((s) => {
    const messages = s.thread.messages;
    const index = messages.findIndex((m) => m.id === s.message.id);
    if (index < 0) return null;
    const current = messages[index]?.createdAt;
    if (!current) return null;
    const previous = index > 0 ? messages[index - 1]?.createdAt : null;
    if (previous) return dayKey(previous) === dayKey(current) ? null : dayLabel(current);
    return dayKey(current) === dayKey(new Date()) ? null : dayLabel(current);
  });

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
