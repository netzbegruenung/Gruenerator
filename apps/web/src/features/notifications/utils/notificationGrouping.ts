import { getNotificationConfig } from '../notificationConfig';
import { NOTIFICATION_GROUPS } from '../types';

import type { Notification, NotificationGroup as NotificationGroupType } from '../types';

export type GroupedEntry =
  | { kind: 'single'; notification: Notification }
  | { kind: 'group'; key: string; items: Notification[] };

export interface CategorySection {
  category: NotificationGroupType;
  label: string;
  entries: GroupedEntry[];
}

// Collapse consecutive notifications sharing a group_key into one entry; keep
// singletons (and single-item groups) as standalone entries, preserving order.
export function groupNotifications(notifications: Notification[]): GroupedEntry[] {
  const groups = new Map<string, Notification[]>();
  const order: (string | Notification)[] = [];

  for (const n of notifications) {
    if (n.group_key) {
      if (!groups.has(n.group_key)) {
        groups.set(n.group_key, []);
        order.push(n.group_key);
      }
      groups.get(n.group_key)!.push(n);
    } else {
      order.push(n);
    }
  }

  return order.map((item) => {
    if (typeof item === 'string') {
      const items = groups.get(item)!;
      if (items.length === 1) {
        return { kind: 'single' as const, notification: items[0] };
      }
      return { kind: 'group' as const, key: item, items };
    }
    return { kind: 'single' as const, notification: item };
  });
}

function getNotificationCategory(entry: GroupedEntry): NotificationGroupType {
  const type = entry.kind === 'group' ? entry.items[0].type : entry.notification.type;
  return (getNotificationConfig(type).group ?? 'system') as NotificationGroupType;
}

// Bucket grouped entries by their category and sort by the category order.
export function groupByCategory(entries: GroupedEntry[]): CategorySection[] {
  const categoryMap = new Map<NotificationGroupType, GroupedEntry[]>();

  for (const entry of entries) {
    const cat = getNotificationCategory(entry);
    const existing = categoryMap.get(cat) ?? [];
    existing.push(entry);
    categoryMap.set(cat, existing);
  }

  return Array.from(categoryMap.entries())
    .map(([category, catEntries]) => ({
      category,
      label: NOTIFICATION_GROUPS[category]?.label ?? 'Sonstige',
      entries: catEntries,
    }))
    .sort(
      (a, b) =>
        (NOTIFICATION_GROUPS[a.category]?.order ?? 99) -
        (NOTIFICATION_GROUPS[b.category]?.order ?? 99)
    );
}

export function formatShortTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'jetzt';
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
