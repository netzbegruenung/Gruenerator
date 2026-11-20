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
  /** Je gescheitertem Inhalt sein `addableKey` und der Satz des Servers — für den Fehler an der Zeile. */
  failures: { key: string; message: string }[];
}

export interface AddToGroupOptions {
  /**
   * Docs, Sheets, Präsentationen und Boards mit Schreibrecht teilen — in Team-Projekten
   * der Standard, denn gemeinsam bearbeiten ist dort der Zweck. Alles andere liest der
   * Server ohnehin nur.
   */
  writeDocuments?: boolean;
}

const permissionsFor = (item: AddableItem, options: AddToGroupOptions) => ({
  read: true,
  write: item.contentType === 'collaborative_documents' && options.writeDocuments === true,
  collaborative: false,
});

export async function addItemsToGroup(
  groupId: string,
  items: readonly AddableItem[],
  note: string | null,
  options: AddToGroupOptions = {}
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
          permissions: permissionsFor(item, options),
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
  const failures = results.flatMap((r, i) =>
    r.status === 'rejected'
      ? [
          {
            key: addableKey(items[i]),
            message: r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
        ]
      : []
  );
  return {
    added: results.length - failures.length,
    failed: failures.length,
    firstError: failures[0]?.message ?? null,
    failures,
  };
}
