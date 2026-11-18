/**
 * „Inhalte hinzufügen" vom Projekt aus: eigene Inhalte auswählen und in einem
 * Rutsch über `POST /groups/:id/share` teilen. Besitz, Papierkorb und das Heben
 * von `share_mode` prüft der Server (`shareContentToGroup` → Schreiber); hier
 * liegt nur, was beide Plattformen gleich machen müssen.
 */
import { GROUP_SHARE_NOTE_MAX, type GroupContentType } from '@gruenerator/contracts';

import { getContractsClient } from '../api/index.js';

import { type GroupFeedItem } from './feed.js';

export interface AddableItem {
  contentType: GroupContentType;
  id: string;
  title: string;
}

/** Derselbe Schlüssel wie `GroupFeedItem.key` — so erkennt die Auswahl, was schon im Projekt liegt. */
export const addableKey = (item: { contentType: string; id: string }): string =>
  `${item.contentType}:${item.id}`;

export function sharedContentKeys(feed: readonly GroupFeedItem[]): Set<string> {
  return new Set(feed.map((item) => item.key));
}

export interface AddToGroupResult {
  added: number;
  failed: number;
  /** Der erste Satz des Servers, etwa „Du kannst nur eigene Inhalte teilen." */
  firstError: string | null;
}

const READ_ONLY = { read: true, write: false, collaborative: false } as const;

export async function addItemsToGroup(
  groupId: string,
  items: readonly AddableItem[],
  note: string | null
): Promise<AddToGroupResult> {
  const trimmed = note?.trim().slice(0, GROUP_SHARE_NOTE_MAX) || null;
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const res = await getContractsClient().groups.shareContent({
        params: { groupId },
        body: {
          contentType: item.contentType,
          contentId: item.id,
          note: trimmed,
          permissions: READ_ONLY,
        },
      });
      if (res.status !== 200) {
        const message =
          res.body && typeof res.body === 'object' && 'message' in res.body
            ? String(res.body.message)
            : `HTTP ${res.status}`;
        throw new Error(message);
      }
    })
  );
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  const first: unknown = rejected[0]?.reason;
  return {
    added: results.length - rejected.length,
    failed: rejected.length,
    firstError: first instanceof Error ? first.message : first ? String(first) : null,
  };
}
