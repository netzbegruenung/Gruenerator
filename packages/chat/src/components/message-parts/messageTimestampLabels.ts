// Pure day-separator logic, kept free of React so the node vitest lane can
// exercise the calendar edge cases (midnight boundary, missing createdAt).

export interface DatedEntry {
  readonly id: string;
  readonly createdAt?: Date;
}

const dayFormat = new Intl.DateTimeFormat('de', { day: 'numeric', month: 'long', year: 'numeric' });

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(d: Date, now: Date): string {
  if (dayKey(d) === dayKey(now)) return 'Heute';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'Gestern';
  return dayFormat.format(d);
}

/**
 * Separator label per message id — one O(N) pass over the thread.
 *
 * A message gets a label when its calendar day differs from the previous
 * message's. Without a previous timestamp (first message, or a rare row that
 * lost its `createdAt`) the comparison falls back to "today", so a fresh
 * all-today chat never opens with a lone "Heute" rule.
 */
export function buildDaySeparatorLabels(
  messages: readonly DatedEntry[],
  now: Date
): Map<string, string | null> {
  const labels = new Map<string, string | null>();
  let previous: Date | null = null;
  for (const message of messages) {
    const current = message.createdAt;
    if (!current) {
      labels.set(message.id, null);
      continue;
    }
    const reference = previous ?? now;
    labels.set(message.id, dayKey(reference) === dayKey(current) ? null : dayLabel(current, now));
    previous = current;
  }
  return labels;
}
